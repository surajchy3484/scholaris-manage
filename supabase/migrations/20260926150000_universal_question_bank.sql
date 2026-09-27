-- Additive migration: legacy school-assessment questions and results remain intact.
CREATE FUNCTION public.question_class(value text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
 SELECT CASE WHEN v ~ '^0*[0-9]+$' THEN (v::integer)::text ELSE upper(v) END
 FROM (SELECT btrim(regexp_replace(coalesce(value,''),'^\s*class\s*','','i')) v) s;
$$;
CREATE TABLE public.exam_types (
 name text PRIMARY KEY CHECK(name=upper(btrim(name)) AND length(name) BETWEEN 1 AND 80),
 visible boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO exam_types(name,visible) VALUES('ICA',true),('MCA',false),('FCA',false);
INSERT INTO exam_types(name) SELECT DISTINCT upper(btrim(exam_type)) FROM assessments WHERE length(btrim(exam_type)) BETWEEN 1 AND 80 ON CONFLICT DO NOTHING;
CREATE TABLE public.question_bank (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 exam_type text NOT NULL REFERENCES exam_types(name),
 class text NOT NULL CHECK(class=question_class(class) AND class<>''),
 question_no integer NOT NULL CHECK(question_no BETWEEN 1 AND 10000),
 question_text text,
 correct_answer text NOT NULL CHECK(correct_answer IN ('A','B','C','D')),
 parameter text, chapter text, topic text, subject text,
 marks numeric NOT NULL DEFAULT 1 CHECK(marks>0),
 difficulty text NOT NULL DEFAULT 'Medium',
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(exam_type,class,question_no)
);
CREATE TRIGGER question_bank_updated BEFORE UPDATE ON question_bank FOR EACH ROW EXECUTE FUNCTION tg_set_updated_at();
CREATE TABLE public.question_bank_migration_issues (
 assessment_id text PRIMARY KEY,exam_type text,class text,reason text NOT NULL,
 questions jsonb NOT NULL, resolved boolean NOT NULL DEFAULT false
);
-- Only identical complete legacy sets are promoted automatically. Differing keys or metadata
-- require explicit selection; never merge different school sets by question number alone.
CREATE TEMP TABLE legacy_question_sets ON COMMIT DROP AS
 SELECT a.assessment_id,upper(btrim(a.exam_type)) exam_type,question_class(a.class) class,
 jsonb_agg(jsonb_build_object('question_no',q.question_no,'question_text',q.question_text,
 'correct_answer',upper(btrim(q.correct_answer)),'parameter',q.parameter,'chapter',q.chapter,
 'topic',q.topic,'subject',q.subject,'marks',q.marks,'difficulty',q.difficulty) ORDER BY q.question_no) questions,
 bool_and(coalesce(q.marks,1)>0 AND q.question_no BETWEEN 1 AND 10000 AND upper(btrim(q.correct_answer)) IN ('A','B','C','D')) valid
 FROM questions q JOIN assessments a USING(assessment_id) GROUP BY a.assessment_id,a.exam_type,a.class;
INSERT INTO question_bank(exam_type,class,question_no,question_text,correct_answer,parameter,chapter,topic,subject,marks,difficulty)
 SELECT s.exam_type,s.class,(q->>'question_no')::int,q->>'question_text',q->>'correct_answer',q->>'parameter',q->>'chapter',q->>'topic',q->>'subject',coalesce((q->>'marks')::numeric,1),coalesce(q->>'difficulty','Medium')
 FROM (SELECT exam_type,class,min(questions::text)::jsonb questions FROM legacy_question_sets GROUP BY exam_type,class
 HAVING class<>'' AND length(exam_type) BETWEEN 1 AND 80 AND bool_and(valid) AND count(DISTINCT questions)=1) s CROSS JOIN LATERAL jsonb_array_elements(s.questions) q;
INSERT INTO question_bank_migration_issues
 SELECT assessment_id,exam_type,class,'Legacy sets differ, or the exam type/class/key needs correction. Select a source set or import a reviewed universal set.',questions,false
 FROM legacy_question_sets s WHERE NOT EXISTS(SELECT 1 FROM question_bank b WHERE b.exam_type=s.exam_type AND b.class=s.class);
-- Orphan legacy questions are retained in their original table and surfaced for review.
INSERT INTO question_bank_migration_issues(assessment_id,reason,questions)
 SELECT q.assessment_id,'No linked assessment. Assign an exam type and class by importing a reviewed universal set.',jsonb_agg(to_jsonb(q) ORDER BY q.question_no)
 FROM questions q WHERE NOT EXISTS(SELECT 1 FROM assessments a WHERE a.assessment_id=q.assessment_id) GROUP BY q.assessment_id;

ALTER TABLE clicker_records ADD COLUMN exam_type text;
UPDATE clicker_records c SET exam_type=upper(btrim(a.exam_type)) FROM assessments a WHERE c.assessment_id=a.assessment_id;
ALTER TABLE clicker_records ADD COLUMN total_questions integer, ADD COLUMN attempted_questions integer,
 ADD COLUMN correct_answers integer, ADD COLUMN wrong_answers integer,ADD COLUMN unattempted_questions integer,
 ADD COLUMN question_snapshot jsonb,ADD COLUMN evaluated_at timestamptz;
CREATE INDEX clicker_exam_class_idx ON clicker_records(exam_type,class);
ALTER TABLE assessment_results ADD COLUMN exam_type text,ADD COLUMN attempted_questions integer,
 ADD COLUMN unattempted_questions integer,ADD COLUMN question_snapshot jsonb,ADD COLUMN clicker_id uuid UNIQUE REFERENCES clicker_records(id) ON DELETE CASCADE;
UPDATE assessment_results r SET exam_type=upper(btrim(a.exam_type)) FROM assessments a WHERE r.assessment_id=a.assessment_id;

CREATE FUNCTION public.evaluate_universal_clicker() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE a assessments%ROWTYPE;s students%ROWTYPE;enabled boolean;q record;k text;v text;n integer;keys jsonb:='{}';answer text;
BEGIN
 NEW.exam_type:=upper(btrim(coalesce(NEW.exam_type,'')));NEW.class:=question_class(NEW.class);
 IF NEW.exam_type='' OR NEW.class='' THEN RAISE EXCEPTION 'Exam Type and Class are required for Clicker evaluation'; END IF;
 SELECT visible INTO enabled FROM exam_types WHERE name=NEW.exam_type FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown Exam Type: %',NEW.exam_type; END IF;
 IF NOT enabled THEN RAISE EXCEPTION 'Question Set Inactive: This Exam Type is currently hidden in Question Master and cannot be used for Clicker evaluation.'; END IF;
 SELECT * INTO a FROM assessments WHERE assessment_id=NEW.assessment_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Select an assessment for school and session context'; END IF;
 IF upper(btrim(a.exam_type))<>NEW.exam_type OR question_class(a.class)<>NEW.class THEN RAISE EXCEPTION 'Assessment Exam Type and Class must match the Clicker row exactly'; END IF;
 IF a.school_id IS NULL OR (NEW.school_id IS NOT NULL AND NEW.school_id<>a.school_id) THEN RAISE EXCEPTION 'Assessment school does not match Clicker school'; END IF;
 NEW.school_id:=a.school_id;NEW.school_name:=a.school_name;
 IF EXISTS(SELECT 1 FROM clicker_records c WHERE c.assessment_id=NEW.assessment_id AND c.id<>NEW.id AND (c.keypad_id=NEW.keypad_id OR (NEW.student_id IS NOT NULL AND c.student_id=NEW.student_id))) THEN RAISE EXCEPTION 'Duplicate Clicker record for this assessment and keypad/student. Edit the existing record.'; END IF;
 IF NEW.student_id IS NOT NULL THEN
  SELECT * INTO s FROM students WHERE id=NEW.student_id;
  IF NOT FOUND OR s.school_id<>NEW.school_id OR question_class(s.class)<>NEW.class OR (NEW.section IS NOT NULL AND upper(btrim(s.division))<>upper(btrim(NEW.section))) THEN RAISE EXCEPTION 'Student school, class or section does not match'; END IF;
 END IF;
 IF jsonb_typeof(NEW.answers) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Answers must be an object'; END IF;
 -- Keep the selected key set stable through the whole transaction, including concurrent inserts.
 LOCK TABLE question_bank IN SHARE MODE;
 SELECT jsonb_agg(to_jsonb(b) ORDER BY question_no) INTO NEW.question_snapshot FROM question_bank b WHERE exam_type=NEW.exam_type AND class=NEW.class;
 IF NEW.question_snapshot IS NULL THEN RAISE EXCEPTION 'No universal questions for Exam Type % and Class %. No fallback key was used.',NEW.exam_type,NEW.class; END IF;
 FOR k,v IN SELECT key,value FROM jsonb_each_text(NEW.answers) LOOP
  k:=upper(btrim(k));v:=upper(btrim(coalesce(v,'')));
  IF k ~ '^[0-9]+-S[0-9]+$' THEN
   IF split_part(k,'-',1)::integer<>substring(k FROM 'S([0-9]+)$')::integer THEN RAISE EXCEPTION 'Mismatched question column: %',k; END IF;
   k:=split_part(k,'-',2);
  END IF;
  IF k !~ '^S[1-9][0-9]{0,3}$' AND k<>'S10000' THEN RAISE EXCEPTION 'Invalid question column: %',k; END IF;
  IF v NOT IN ('','A','B','C','D') THEN RAISE EXCEPTION 'Invalid response for %: use A/B/C/D or blank',k; END IF;
  IF keys ? k THEN RAISE EXCEPTION 'Duplicate question column: %',k; END IF;
  IF NOT EXISTS(SELECT 1 FROM question_bank b WHERE exam_type=NEW.exam_type AND class=NEW.class AND question_no=substring(k FROM 2)::int) THEN
   IF v<>'' THEN RAISE EXCEPTION 'No answer key for % / Class % / %',NEW.exam_type,NEW.class,k; END IF;
  ELSE keys:=keys||jsonb_build_object(k,v); END IF;
 END LOOP;
 NEW.answers:=keys;NEW.total_questions:=jsonb_array_length(NEW.question_snapshot);NEW.correct_answers:=0;NEW.attempted_questions:=0;
 FOR q IN SELECT value FROM jsonb_array_elements(NEW.question_snapshot) LOOP
  answer:=coalesce(keys->>('S'||(q.value->>'question_no')),'');
  IF answer<>'' THEN NEW.attempted_questions:=NEW.attempted_questions+1; END IF;
  IF answer=q.value->>'correct_answer' THEN NEW.correct_answers:=NEW.correct_answers+1; END IF;
 END LOOP;
 NEW.wrong_answers:=NEW.attempted_questions-NEW.correct_answers;
 NEW.unattempted_questions:=NEW.total_questions-NEW.attempted_questions;
 NEW.score:=NEW.correct_answers;NEW.correct_rate:=round(NEW.correct_answers::numeric/NEW.total_questions*100,1);
 NEW.ranking:=NULL;NEW.evaluated_at:=now();RETURN NEW;
END $$;
CREATE TRIGGER universal_clicker_evaluate BEFORE INSERT OR UPDATE OF answers,exam_type,class,assessment_id,school_id,student_id,section,score,correct_rate ON clicker_records FOR EACH ROW EXECUTE FUNCTION evaluate_universal_clicker();

-- All app writes use one transaction: evaluation, competition ranks, immutable key snapshots,
-- and linked report scores succeed together. Serialize batches to prevent ranking races.
CREATE FUNCTION public.universal_clicker_write(p_mode text,p_rows jsonb DEFAULT '[]',p_ids uuid[] DEFAULT '{}',p_patch jsonb DEFAULT '{}',p_schools uuid[] DEFAULT NULL) RETURNS integer
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

DO $$ DECLARE tab text; BEGIN
 FOREACH tab IN ARRAY ARRAY['exam_types','question_bank','question_bank_migration_issues'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',tab);
  EXECUTE format('REVOKE ALL ON %I FROM PUBLIC,anon,authenticated',tab);
  EXECUTE format('GRANT ALL ON %I TO service_role',tab);
  EXECUTE format('CREATE POLICY server_only ON %I FOR ALL TO service_role USING(true) WITH CHECK(true)',tab);
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION universal_clicker_write(text,jsonb,uuid[],jsonb,uuid[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION universal_clicker_write(text,jsonb,uuid[],jsonb,uuid[]) TO service_role;
CREATE FUNCTION public.universal_questions_page(p_exam text,p_class text,p_search text,p_page integer,p_size integer,p_sort text,p_desc boolean) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path=public AS $$
DECLARE result jsonb;sort text;
BEGIN
 sort:=CASE WHEN p_sort=ANY(ARRAY['exam_type','class','question_no','question_text','correct_answer','parameter','chapter','topic','subject']) THEN p_sort ELSE 'question_no' END;
 EXECUTE format('WITH filtered AS (SELECT * FROM question_bank WHERE ($1='''' OR exam_type=upper(btrim($1))) AND ($2='''' OR class=question_class($2)) AND ($3='''' OR strpos(lower(concat_ws('' '',exam_type,class,question_text,parameter,chapter,topic,subject)),lower($3))>0)), page AS (SELECT * FROM filtered ORDER BY %I %s,id LIMIT $4 OFFSET $5) SELECT jsonb_build_object(''rows'',coalesce((SELECT jsonb_agg(page) FROM page),''[]''),''total'',(SELECT count(*) FROM filtered))',sort,CASE WHEN p_desc THEN 'DESC' ELSE 'ASC' END)
 INTO result USING p_exam,p_class,p_search,least(250,greatest(1,p_size)),greatest(0,p_page)*least(250,greatest(1,p_size));RETURN result;
END $$;
REVOKE ALL ON FUNCTION universal_questions_page(text,text,text,integer,integer,text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION universal_questions_page(text,text,text,integer,integer,text,boolean) TO service_role;

-- Add the Exam Type column to existing Clicker search and sort.
CREATE OR REPLACE FUNCTION public.performance_master_page(
  p_table text,
  p_page integer DEFAULT 0,
  p_size integer DEFAULT 25,
  p_search text DEFAULT '',
  p_sort text DEFAULT NULL,
  p_desc boolean DEFAULT false,
  p_assessment text DEFAULT 'all',
  p_subject text DEFAULT '',
  p_min_score numeric DEFAULT NULL,
  p_schools uuid[] DEFAULT NULL,
  p_class text DEFAULT '',
  p_section text DEFAULT '',
  p_team text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE
  predicate text := 'true';
  ordering text;
  result jsonb;
  total bigint;
  columns jsonb := '[]';
  allowed text[];
  search_columns text[];
  search_parts text[] := '{}';
  col text;
  pattern text;
BEGIN
  IF p_table NOT IN ('assessments','questions','clicker_records') OR p_size NOT BETWEEN 1 AND 250 OR p_page < 0 THEN
    RAISE EXCEPTION 'Invalid paging request';
  END IF;

  IF p_table = 'assessments' THEN
    allowed := ARRAY['assessment_id','name','school_name','class','section','exam_type','date','total_questions','status','created_at'];
    search_columns := ARRAY['assessment_id','name','school_name','class','section','exam_type','status','subject'];
  ELSIF p_table = 'questions' THEN
    allowed := ARRAY['assessment_id','question_no','correct_answer','parameter','topic','chapter','subject','marks','difficulty','status'];
    search_columns := ARRAY['assessment_id','correct_answer','parameter','topic','chapter','subject','question_text'];
  ELSE
    allowed := ARRAY['exam_type','assessment_id','keypad_id','student_name','roll_number','school_name','class','section','team','score','correct_rate','ranking'];
    search_columns := ARRAY['exam_type','assessment_id','keypad_id','student_name','roll_number','school_name','class','section','team'];
  END IF;

  IF p_schools IS NOT NULL THEN
    IF p_table = 'questions' THEN
      predicate := predicate || format(' AND t.assessment_id IN (SELECT a.assessment_id FROM public.assessments a WHERE a.school_id=ANY(%L::uuid[]))', p_schools);
    ELSE
      predicate := predicate || format(' AND t.school_id=ANY(%L::uuid[])', p_schools);
    END IF;
  END IF;
  IF p_assessment <> 'all' THEN predicate := predicate || format(' AND t.assessment_id=%L', p_assessment); END IF;
  IF p_subject <> '' AND p_table = 'questions' THEN
    predicate := predicate || format(' AND t.subject ILIKE %L', '%' || replace(replace(replace(p_subject,E'\\',E'\\\\'),'%',E'\\%'),'_',E'\\_') || '%');
  END IF;
  IF p_min_score IS NOT NULL AND p_table = 'clicker_records' THEN predicate := predicate || format(' AND t.score >= %L', p_min_score); END IF;
  IF p_class <> '' AND p_table = 'clicker_records' THEN predicate := predicate || format(' AND t.class ILIKE %L', '%' || replace(replace(replace(p_class,E'\\',E'\\\\'),'%',E'\\%'),'_',E'\\_') || '%'); END IF;
  IF p_section <> '' AND p_table = 'clicker_records' THEN predicate := predicate || format(' AND t.section ILIKE %L', '%' || replace(replace(replace(p_section,E'\\',E'\\\\'),'%',E'\\%'),'_',E'\\_') || '%'); END IF;
  IF p_team <> '' AND p_table = 'clicker_records' THEN predicate := predicate || format(' AND t.team ILIKE %L', '%' || replace(replace(replace(p_team,E'\\',E'\\\\'),'%',E'\\%'),'_',E'\\_') || '%'); END IF;

  IF btrim(p_search) <> '' THEN
    pattern := '%' || replace(replace(replace(btrim(p_search),E'\\',E'\\\\'),'%',E'\\%'),'_',E'\\_') || '%';
    FOREACH col IN ARRAY search_columns LOOP search_parts := array_append(search_parts, format('t.%I ILIKE %L', col, pattern)); END LOOP;
    FOREACH col IN ARRAY allowed LOOP IF NOT col = ANY(search_columns) THEN search_parts := array_append(search_parts, format('t.%I::text ILIKE %L', col, pattern)); END IF; END LOOP;
    IF p_table = 'clicker_records' THEN search_parts := array_append(search_parts, format('t.answers::text ILIKE %L', pattern)); END IF;
    predicate := predicate || ' AND (' || array_to_string(search_parts, ' OR ') || ')';
  END IF;

  IF p_sort = ANY(allowed) THEN ordering := format('t.%I', p_sort);
  ELSIF p_table = 'clicker_records' AND p_sort ~ '^S[0-9]+$' THEN ordering := format('(t.answers->>%L)', p_sort);
  ELSE ordering := CASE p_table WHEN 'assessments' THEN 't.created_at' WHEN 'questions' THEN 't.question_no' ELSE 't.ranking' END;
  END IF;
  ordering := ordering || CASE WHEN p_desc OR (p_table = 'assessments' AND p_sort IS NULL) THEN ' DESC' ELSE ' ASC' END || ' NULLS LAST,t.id ASC';

  EXECUTE format('SELECT count(*) FROM public.%I t WHERE %s', p_table, predicate) INTO total;
  EXECUTE format('SELECT coalesce(jsonb_agg(to_jsonb(page)),''[]''::jsonb) FROM (SELECT t.* FROM public.%I t WHERE %s ORDER BY %s LIMIT %s OFFSET %s) page', p_table, predicate, ordering, p_size, p_page::bigint * p_size) INTO result;

  IF p_table = 'clicker_records' AND p_page = 0 THEN
    EXECUTE format('SELECT coalesce(jsonb_agg(k ORDER BY substring(k,2)::int),''[]''::jsonb) FROM (SELECT DISTINCT upper(keys.k) k FROM public.clicker_records c CROSS JOIN LATERAL jsonb_object_keys(c.answers) keys(k) WHERE upper(keys.k) ~ ''^S[0-9]+$'' AND (%L=''all'' OR c.assessment_id=%L) AND (%L::uuid[] IS NULL OR c.school_id=ANY(%L::uuid[]))) cols', p_assessment, p_assessment, p_schools, p_schools) INTO columns;
  END IF;
  RETURN jsonb_build_object('rows', result, 'total', total, 'questionColumns', columns);
END $$;
