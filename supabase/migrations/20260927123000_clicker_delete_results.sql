-- Preserve existing records; repair future explicit Clicker deletions.
CREATE OR REPLACE FUNCTION public.universal_clicker_write(p_mode text,p_rows jsonb DEFAULT '[]',p_ids uuid[] DEFAULT '{}',p_patch jsonb DEFAULT '{}',p_schools uuid[] DEFAULT NULL) RETURNS integer
LANGUAGE plpgsql SET search_path=public AS $$
DECLARE ids uuid[]:='{}';sids uuid[]:='{}';before_sids uuid[];aids text[]:='{}';before_aids text[];item jsonb;newid uuid;n integer:=0;col text;assignments text;
BEGIN
 LOCK TABLE clicker_records IN SHARE ROW EXCLUSIVE MODE;
 LOCK TABLE assessments IN SHARE MODE;
 IF cardinality(p_ids)<>(SELECT count(*) FROM clicker_records WHERE id=ANY(p_ids)) THEN RAISE EXCEPTION 'A Clicker record no longer exists. Refresh and retry.'; END IF;
 IF p_schools IS NOT NULL THEN
  IF EXISTS(SELECT 1 FROM clicker_records WHERE id=ANY(p_ids) AND (school_id IS NULL OR NOT school_id=ANY(p_schools))) THEN RAISE EXCEPTION 'School access denied'; END IF;
  IF EXISTS(SELECT 1 FROM assessments WHERE assessment_id IN (SELECT value->>'assessment_id' FROM jsonb_array_elements(p_rows) UNION SELECT p_patch->>'assessment_id') AND (school_id IS NULL OR NOT school_id=ANY(p_schools))) THEN RAISE EXCEPTION 'School access denied'; END IF;
 END IF;
 IF jsonb_array_length(p_rows)>500 OR cardinality(p_ids)>500 THEN RAISE EXCEPTION 'Maximum 500 records per batch'; END IF;
 SELECT array_agg(DISTINCT student_id) INTO before_sids FROM clicker_records WHERE id=ANY(p_ids);
 SELECT array_agg(DISTINCT assessment_id) INTO before_aids FROM clicker_records WHERE id=ANY(p_ids);
 IF p_mode='insert' THEN
  FOR item IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
   INSERT INTO clicker_records(assessment_id,exam_type,keypad_id,student_id,student_name,roll_number,school_id,school_name,class,section,team,answers)
   VALUES(item->>'assessment_id',item->>'exam_type',item->>'keypad_id',nullif(item->>'student_id','')::uuid,item->>'student_name',item->>'roll_number',nullif(item->>'school_id','')::uuid,item->>'school_name',item->>'class',item->>'section',item->>'team',coalesce(item->'answers','{}')) RETURNING id INTO newid;
   ids:=array_append(ids,newid);n:=n+1;
  END LOOP;
 ELSIF p_mode='update' THEN
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_patch) k WHERE k<>ALL(ARRAY['assessment_id','exam_type','keypad_id','student_id','student_name','roll_number','school_id','school_name','class','section','team','answers'])) THEN RAISE EXCEPTION 'Calculated Clicker fields are read-only'; END IF;
  IF p_patch='{}'::jsonb THEN RETURN 0; END IF;
  SELECT string_agg(format('%I=r.%I',k,k),',') INTO assignments FROM jsonb_object_keys(p_patch) k;
  -- Always re-evaluate even if only a name or team was edited; hidden exam types remain blocked.
  IF NOT p_patch ? 'answers' THEN assignments:=assignments||',answers=t.answers'; END IF;
  EXECUTE format('UPDATE clicker_records t SET %s FROM jsonb_populate_record(NULL::clicker_records,$1) r WHERE t.id=ANY($2)',assignments) USING p_patch,p_ids;
  GET DIAGNOSTICS n=ROW_COUNT;ids:=p_ids;
 ELSIF p_mode='delete' THEN
  ids:=p_ids; -- Retain deleted IDs so linked assessment results are removed below.
  DELETE FROM clicker_records WHERE id=ANY(p_ids);GET DIAGNOSTICS n=ROW_COUNT;
 ELSE RAISE EXCEPTION 'Unknown write mode'; END IF;
 IF p_schools IS NOT NULL AND EXISTS(SELECT 1 FROM clicker_records WHERE id=ANY(ids) AND (school_id IS NULL OR NOT school_id=ANY(p_schools))) THEN RAISE EXCEPTION 'School access denied'; END IF;
 SELECT array_agg(DISTINCT assessment_id) INTO aids FROM clicker_records WHERE id=ANY(ids);
 aids:=coalesce(aids,'{}')||coalesce(before_aids,'{}');
 SELECT array_agg(DISTINCT student_id) INTO sids FROM clicker_records WHERE id=ANY(ids);
 sids:=coalesce(sids,'{}')||coalesce(before_sids,'{}');
 DELETE FROM assessment_results WHERE clicker_id=ANY(ids);
 WITH ranks AS(SELECT id,rank() OVER(PARTITION BY school_id,assessment_id,exam_type,class,section ORDER BY score DESC) r FROM clicker_records WHERE assessment_id=ANY(aids) AND evaluated_at IS NOT NULL)
 UPDATE clicker_records c SET ranking=r.r FROM ranks r WHERE c.id=r.id;
 INSERT INTO assessment_results(assessment_id,keypad_id,student_id,student_name,school_id,school_name,class,section,score,total_questions,correct_answers,wrong_answers,correct_rate,ranking,answers,exam_type,attempted_questions,unattempted_questions,question_snapshot,clicker_id)
 SELECT assessment_id,keypad_id,student_id,student_name,school_id,school_name,class,section,score,total_questions,correct_answers,wrong_answers,correct_rate,ranking,answers,exam_type,attempted_questions,unattempted_questions,question_snapshot,id FROM clicker_records WHERE assessment_id=ANY(aids) AND evaluated_at IS NOT NULL
 ON CONFLICT(assessment_id,keypad_id) DO UPDATE SET student_id=excluded.student_id,student_name=excluded.student_name,school_id=excluded.school_id,school_name=excluded.school_name,class=excluded.class,section=excluded.section,score=excluded.score,total_questions=excluded.total_questions,correct_answers=excluded.correct_answers,wrong_answers=excluded.wrong_answers,correct_rate=excluded.correct_rate,ranking=excluded.ranking,answers=excluded.answers,exam_type=excluded.exam_type,attempted_questions=excluded.attempted_questions,unattempted_questions=excluded.unattempted_questions,question_snapshot=excluded.question_snapshot,clicker_id=excluded.clicker_id,calculated_at=now();
 -- Latest evaluated assessment supplies its exact exam type/year/subject summary. Never default to ICA.
 INSERT INTO exam_scores(school_id,student_id,exam_type,academic_year,subject,score)
 SELECT DISTINCT ON(c.student_id,c.exam_type,a.academic_year,coalesce(a.subject,'')) c.school_id,c.student_id,c.exam_type,a.academic_year,a.subject,c.correct_rate
 FROM clicker_records c JOIN assessments a USING(assessment_id) WHERE c.student_id=ANY(sids) AND c.evaluated_at IS NOT NULL
 AND EXISTS(SELECT 1 FROM assessments changed WHERE changed.assessment_id=ANY(aids) AND upper(btrim(changed.exam_type))=c.exam_type)
 ORDER BY c.student_id,c.exam_type,a.academic_year,coalesce(a.subject,''),a.date DESC NULLS LAST,c.evaluated_at DESC,c.id DESC
 ON CONFLICT(student_id,exam_type,academic_year,(coalesce(subject,''))) DO UPDATE SET score=excluded.score,school_id=excluded.school_id;
 RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.universal_clicker_write(text,jsonb,uuid[],jsonb,uuid[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.universal_clicker_write(text,jsonb,uuid[],jsonb,uuid[]) TO service_role;
