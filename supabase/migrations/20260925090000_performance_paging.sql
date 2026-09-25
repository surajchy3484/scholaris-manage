-- Additive migration: no row updates, deletes, constraint changes, or access grants to clients.
-- Apply off-peak: index creation takes locks; see docs/performance-audit.md for large-table rollout.
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;
CREATE INDEX IF NOT EXISTS perf_students_school_name_id ON public.students(school_id,name,id);
CREATE INDEX IF NOT EXISTS perf_students_name_search ON public.students USING gin(name extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS perf_students_code_search ON public.students USING gin(student_code extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS perf_assessments_created_id ON public.assessments(created_at DESC,id);
CREATE INDEX IF NOT EXISTS perf_questions_assessment_no_id ON public.questions(assessment_id,question_no,id);
CREATE INDEX IF NOT EXISTS perf_questions_topic_search ON public.questions USING gin(topic extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS perf_clicker_assessment_rank_id ON public.clicker_records(assessment_id,ranking,id);
CREATE INDEX IF NOT EXISTS perf_clicker_student_name_search ON public.clicker_records USING gin(student_name extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS perf_attendance_school_student ON public.attendance(school_id,student_id);

CREATE OR REPLACE FUNCTION public.performance_master_page(p_table text,p_page integer DEFAULT 0,p_size integer DEFAULT 25,p_search text DEFAULT '',p_sort text DEFAULT NULL,p_desc boolean DEFAULT false,p_assessment text DEFAULT 'all',p_subject text DEFAULT '',p_min_score numeric DEFAULT NULL,p_schools uuid[] DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE predicate text:='true'; ordering text; result jsonb; total bigint; columns jsonb:='[]'; allowed text[]; search_columns text[]; search_parts text[]:='{}'; col text; pattern text;
BEGIN
 IF p_table NOT IN ('assessments','questions','clicker_records') OR p_size NOT BETWEEN 1 AND 250 OR p_page<0 THEN RAISE EXCEPTION 'Invalid paging request'; END IF;
 IF p_table='assessments' THEN
  allowed:=ARRAY['assessment_id','name','school_name','class','section','exam_type','date','total_questions','status','created_at'];
  search_columns:=ARRAY['assessment_id','name','school_name','class','section','exam_type','status','subject'];
 ELSEIF p_table='questions' THEN
  allowed:=ARRAY['assessment_id','question_no','correct_answer','parameter','topic','chapter','subject','marks','difficulty','status'];
  search_columns:=ARRAY['assessment_id','correct_answer','parameter','topic','chapter','subject','question_text'];
 ELSE
  allowed:=ARRAY['assessment_id','keypad_id','student_name','roll_number','school_name','class','section','team','score','correct_rate','ranking'];
  search_columns:=ARRAY['assessment_id','keypad_id','student_name','roll_number','school_name','class','section','team'];
 END IF;
 IF p_schools IS NOT NULL THEN
  IF p_table='questions' THEN predicate:=predicate||format(' AND t.assessment_id IN (SELECT a.assessment_id FROM public.assessments a WHERE a.school_id=ANY(%L::uuid[]))',p_schools);
  ELSE predicate:=predicate||format(' AND t.school_id=ANY(%L::uuid[])',p_schools); END IF;
 END IF;
 IF p_assessment<>'all' THEN predicate:=predicate||format(' AND t.assessment_id=%L',p_assessment); END IF;
 IF p_subject<>'' AND p_table='questions' THEN predicate:=predicate||format(' AND t.subject ILIKE %L','%'||replace(replace(replace(p_subject,E'\\',E'\\\\'),'%',E'\\%'),'_',E'\\_')||'%'); END IF;
 IF p_min_score IS NOT NULL AND p_table='clicker_records' THEN predicate:=predicate||format(' AND t.score>=%L',p_min_score); END IF;
 IF btrim(p_search)<>'' THEN
  pattern:='%'||replace(replace(replace(btrim(p_search),E'\\',E'\\\\'),'%',E'\\%'),'_',E'\\_')||'%';
  FOREACH col IN ARRAY search_columns LOOP search_parts:=array_append(search_parts,format('t.%I ILIKE %L',col,pattern)); END LOOP;
  -- Numeric/date fields retain the grid's substring-search behaviour; answer JSON remains searchable.
  FOREACH col IN ARRAY allowed LOOP IF NOT col=ANY(search_columns) THEN search_parts:=array_append(search_parts,format('t.%I::text ILIKE %L',col,pattern)); END IF; END LOOP;
  IF p_table='clicker_records' THEN search_parts:=array_append(search_parts,format('t.answers::text ILIKE %L',pattern)); END IF;
  predicate:=predicate||' AND ('||array_to_string(search_parts,' OR ')||')';
 END IF;
 IF p_sort=ANY(allowed) THEN ordering:=format('t.%I',p_sort);
 ELSEIF p_table='clicker_records' AND p_sort ~ '^S[0-9]+$' THEN ordering:=format('(t.answers->>%L)',p_sort);
 ELSE ordering:=CASE p_table WHEN 'assessments' THEN 't.created_at' WHEN 'questions' THEN 't.question_no' ELSE 't.ranking' END; END IF;
 ordering:=ordering||CASE WHEN p_desc OR (p_table='assessments' AND p_sort IS NULL) THEN ' DESC' ELSE ' ASC' END||' NULLS LAST,t.id ASC';
 EXECUTE format('SELECT count(*) FROM public.%I t WHERE %s',p_table,predicate) INTO total;
 EXECUTE format('SELECT coalesce(jsonb_agg(to_jsonb(page)),''[]''::jsonb) FROM (SELECT t.* FROM public.%I t WHERE %s ORDER BY %s LIMIT %s OFFSET %s) page',p_table,predicate,ordering,p_size,p_page::bigint*p_size) INTO result;
 -- Columns must reflect the entire selected assessment, not just this page or search result.
 IF p_table='clicker_records' AND p_page=0 THEN
  EXECUTE format('SELECT coalesce(jsonb_agg(k ORDER BY substring(k,2)::int),''[]''::jsonb) FROM (SELECT DISTINCT upper(keys.k) k FROM public.clicker_records c CROSS JOIN LATERAL jsonb_object_keys(c.answers) keys(k) WHERE upper(keys.k) ~ ''^S[0-9]+$'' AND (%L=''all'' OR c.assessment_id=%L) AND (%L::uuid[] IS NULL OR c.school_id=ANY(%L::uuid[]))) cols',p_assessment,p_assessment,p_schools,p_schools) INTO columns;
 END IF;
 RETURN jsonb_build_object('rows',result,'total',total,'questionColumns',columns);
END $$;

CREATE OR REPLACE FUNCTION public.performance_student_facets(p_school uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public,pg_temp AS $$
 SELECT jsonb_build_object('total',(SELECT count(*) FROM public.students WHERE school_id=p_school),'groups',(SELECT coalesce(jsonb_agg(g),'[]'::jsonb) FROM (SELECT DISTINCT class,division FROM public.students WHERE school_id=p_school ORDER BY class,division) g));
$$;
CREATE OR REPLACE FUNCTION public.performance_student_page(p_school uuid,p_class text DEFAULT 'all',p_division text DEFAULT 'all',p_search text DEFAULT '',p_page integer DEFAULT 0,p_size integer DEFAULT 25,p_sort text DEFAULT 'roll-asc') RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE predicate text; ordering text; pattern text; result jsonb; total bigint;
BEGIN
 IF p_size NOT BETWEEN 1 AND 250 OR p_page<0 THEN RAISE EXCEPTION 'Invalid paging request'; END IF;
 predicate:=format('school_id=%L',p_school);
 IF p_class<>'all' THEN predicate:=predicate||format(' AND class=%L',p_class); END IF;
 IF p_division<>'all' THEN predicate:=predicate||format(' AND division=%L',p_division); END IF;
 IF btrim(p_search)<>'' THEN
  pattern:='%'||replace(replace(replace(btrim(p_search),E'\\',E'\\\\'),'%',E'\\%'),'_',E'\\_')||'%';
  predicate:=predicate||format(' AND (name ILIKE %L OR student_code ILIKE %L OR roll_number ILIKE %L)',pattern,pattern,pattern);
 END IF;
 ordering:=CASE p_sort WHEN 'name-asc' THEN 'name ASC,id ASC' WHEN 'name-desc' THEN 'name DESC,id ASC'
 WHEN 'roll-desc' THEN '(substring(roll_number from ''^[+-]?[0-9]+''))::numeric DESC NULLS FIRST,roll_number DESC,id ASC'
 ELSE '(substring(roll_number from ''^[+-]?[0-9]+''))::numeric ASC NULLS LAST,roll_number ASC,id ASC' END;
 EXECUTE 'SELECT count(*) FROM public.students WHERE '||predicate INTO total;
 EXECUTE format('SELECT coalesce(jsonb_agg(to_jsonb(page)),''[]''::jsonb) FROM (SELECT * FROM public.students WHERE %s ORDER BY %s LIMIT %s OFFSET %s) page',predicate,ordering,p_size,p_page::bigint*p_size) INTO result;
 RETURN jsonb_build_object('rows',result,'total',total);
END $$;
REVOKE ALL ON FUNCTION public.performance_master_page(text,integer,integer,text,text,boolean,text,text,numeric,uuid[]) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.performance_student_page(uuid,text,text,text,integer,integer,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.performance_student_facets(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.performance_master_page(text,integer,integer,text,text,boolean,text,text,numeric,uuid[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.performance_student_page(uuid,text,text,text,integer,integer,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.performance_student_facets(uuid) TO service_role;

-- Serialize imports per school. Existing students are skipped by class/division/roll.
CREATE OR REPLACE FUNCTION public.performance_import_students(p_school uuid,p_rows jsonb) RETURNS integer
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE school_code text; prefix text; sequence_no bigint; row_data jsonb; added integer:=0;
BEGIN
 IF jsonb_typeof(p_rows)<>'array' OR jsonb_array_length(p_rows)>250 THEN RAISE EXCEPTION 'Invalid batch'; END IF;
 SELECT code INTO school_code FROM public.schools WHERE id=p_school FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'School not found'; END IF;
 prefix:=school_code||'-STU';
 SELECT coalesce(max(substring(student_code,length(prefix)+1)::bigint),0) INTO sequence_no FROM public.students
 WHERE school_id=p_school AND starts_with(student_code,prefix) AND substring(student_code,length(prefix)+1) ~ '^[0-9]+$';
 FOR row_data IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
  IF coalesce(btrim(row_data->>'name'),'')='' OR coalesce(btrim(row_data->>'class'),'')='' OR coalesce(btrim(row_data->>'division'),'')='' OR coalesce(btrim(row_data->>'roll_number'),'')='' THEN RAISE EXCEPTION 'Missing student fields'; END IF;
  IF EXISTS(SELECT 1 FROM public.students WHERE school_id=p_school AND lower(class)=lower(row_data->>'class') AND lower(division)=lower(row_data->>'division') AND lower(roll_number)=lower(row_data->>'roll_number')) THEN CONTINUE; END IF;
  sequence_no:=sequence_no+1;
  INSERT INTO public.students(school_id,student_code,name,class,division,roll_number) VALUES(p_school,prefix||lpad(sequence_no::text,greatest(6,length(sequence_no::text)),'0'),row_data->>'name',row_data->>'class',row_data->>'division',row_data->>'roll_number');
  added:=added+1;
 END LOOP;
 RETURN added;
END $$;
CREATE INDEX IF NOT EXISTS perf_students_import_identity ON public.students(school_id,lower(class),lower(division),lower(roll_number));
REVOKE ALL ON FUNCTION public.performance_import_students(uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.performance_import_students(uuid,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.performance_question_keys(p_assessments text[],p_schools uuid[] DEFAULT NULL) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public,pg_temp AS $$
 SELECT coalesce(jsonb_agg(q),'[]'::jsonb) FROM (
  SELECT assessment_id,question_no,correct_answer FROM public.questions
  WHERE assessment_id=ANY(p_assessments) AND (p_schools IS NULL OR assessment_id IN (SELECT assessment_id FROM public.assessments WHERE school_id=ANY(p_schools)))
 ) q;
$$;
REVOKE ALL ON FUNCTION public.performance_question_keys(text[],uuid[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.performance_question_keys(text[],uuid[]) TO service_role;
