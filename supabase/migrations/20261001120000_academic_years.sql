-- Additive academic history. Apply after Universal Question Master and session assignment plans.
BEGIN;
CREATE TABLE IF NOT EXISTS public.academic_years (
 id text PRIMARY KEY, name text NOT NULL, is_current boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS academic_year_single_current ON public.academic_years(is_current) WHERE is_current;
INSERT INTO public.academic_years(id,name,is_current) VALUES('2026-27','2026–27', NOT EXISTS(SELECT 1 FROM public.academic_years WHERE is_current)) ON CONFLICT(id) DO NOTHING;
INSERT INTO public.academic_years(id,name) SELECT DISTINCT academic_year,academic_year FROM public.assessments WHERE nullif(btrim(academic_year),'') IS NOT NULL ON CONFLICT DO NOTHING;
INSERT INTO public.academic_years(id,name) SELECT DISTINCT academic_year,academic_year FROM public.exam_scores WHERE nullif(btrim(academic_year),'') IS NOT NULL ON CONFLICT DO NOTHING;
CREATE OR REPLACE FUNCTION public.academic_selected_year() RETURNS text LANGUAGE sql STABLE AS $$
 SELECT coalesce(nullif(coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb->>'x-academic-year',''),(SELECT id FROM public.academic_years WHERE is_current));
$$;
CREATE TABLE IF NOT EXISTS public.student_enrollments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE RESTRICT,
 academic_year text NOT NULL REFERENCES public.academic_years(id), school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
 class text NOT NULL, division text NOT NULL DEFAULT '', roll_number text NOT NULL DEFAULT '',
 status text NOT NULL DEFAULT 'Active' CHECK(status IN ('Active','Promoted','Transferred','Left School','Inactive')),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(student_id,academic_year)
);
CREATE INDEX IF NOT EXISTS enrollment_school_year_class ON public.student_enrollments(school_id,academic_year,class,division);
INSERT INTO public.student_enrollments(student_id,academic_year,school_id,class,division,roll_number)
 SELECT id,'2026-27',school_id,class,coalesce(division,''),coalesce(roll_number,'') FROM public.students ON CONFLICT DO NOTHING;
ALTER TABLE public.students DROP CONSTRAINT IF EXISTS students_school_id_class_division_roll_number_key;
-- Student codes remain unchanged on transfer. Existing UUIDs are the global identity;
-- historical school-specific codes may legitimately collide after a transfer.
ALTER TABLE public.students DROP CONSTRAINT IF EXISTS students_school_id_student_code_key;
CREATE INDEX IF NOT EXISTS academic_student_code ON public.students(student_code);
CREATE UNIQUE INDEX IF NOT EXISTS enrollment_roll_unique ON public.student_enrollments(academic_year,school_id,class,division,roll_number) WHERE roll_number<>'';
-- Legacy fields remain a compatibility projection. Enrollments are authoritative.
CREATE OR REPLACE VIEW public.academic_roster AS
 SELECT s.id,e.school_id,s.student_code,s.name,e.class,e.division,e.roll_number,s.photo_url,s.enrollment_date,s.created_at,s.updated_at,
 e.academic_year,e.status AS enrollment_status,e.id AS enrollment_id
 FROM public.students s JOIN public.student_enrollments e ON e.student_id=s.id WHERE e.academic_year=public.academic_selected_year();
REVOKE ALL ON public.academic_roster FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.academic_roster TO service_role;
CREATE OR REPLACE FUNCTION public.academic_student_enrollment() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE yr text:=academic_selected_year();
BEGIN
 IF NOT EXISTS(SELECT 1 FROM academic_years WHERE id=yr AND is_current) THEN RAISE EXCEPTION 'Edit student enrollment in the current academic year only'; END IF;
 IF TG_OP='UPDATE' AND NEW.student_code IS DISTINCT FROM OLD.student_code THEN RAISE EXCEPTION 'Permanent Student ID cannot be changed'; END IF;
 IF TG_OP='UPDATE' AND (NEW.class,NEW.division,NEW.roll_number,NEW.school_id) IS NOT DISTINCT FROM (OLD.class,OLD.division,OLD.roll_number,OLD.school_id) THEN RETURN NEW; END IF;
 INSERT INTO student_enrollments(student_id,academic_year,school_id,class,division,roll_number)
 VALUES(NEW.id,yr,NEW.school_id,NEW.class,coalesce(NEW.division,''),coalesce(NEW.roll_number,''))
 ON CONFLICT(student_id,academic_year) DO UPDATE SET school_id=excluded.school_id,class=excluded.class,division=excluded.division,roll_number=excluded.roll_number,updated_at=now();
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS academic_student_enrollment ON public.students;
CREATE TRIGGER academic_student_enrollment AFTER INSERT OR UPDATE ON public.students FOR EACH ROW EXECUTE FUNCTION public.academic_student_enrollment();
-- Preserve permanent IDs and past results on deletion; use enrollment status instead.
CREATE OR REPLACE FUNCTION public.academic_preserve_student() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Student history is preserved. Set enrollment status to Left School or Inactive in Academic Year instead of deleting the student.'; END $$;
DROP TRIGGER IF EXISTS academic_preserve_student ON public.students;
CREATE TRIGGER academic_preserve_student BEFORE DELETE ON public.students FOR EACH ROW EXECUTE FUNCTION public.academic_preserve_student();
ALTER TABLE public.assessments ALTER COLUMN academic_year DROP DEFAULT;
ALTER TABLE public.exam_scores ALTER COLUMN academic_year DROP DEFAULT;
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS academic_year text;
ALTER TABLE public.session_division_status ADD COLUMN IF NOT EXISTS academic_year text;
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS academic_year text;
ALTER TABLE public.clicker_records ADD COLUMN IF NOT EXISTS academic_year text;
ALTER TABLE public.assessment_results ADD COLUMN IF NOT EXISTS academic_year text;
UPDATE public.sessions SET academic_year='2026-27' WHERE academic_year IS NULL;
UPDATE public.session_division_status d SET academic_year=s.academic_year FROM public.sessions s WHERE d.session_id=s.id AND d.academic_year IS NULL;
UPDATE public.attendance SET academic_year='2026-27' WHERE academic_year IS NULL;
UPDATE public.clicker_records c SET academic_year=a.academic_year FROM public.assessments a WHERE c.assessment_id=a.assessment_id AND c.academic_year IS NULL;
UPDATE public.assessment_results r SET academic_year=a.academic_year FROM public.assessments a WHERE r.assessment_id=a.assessment_id AND r.academic_year IS NULL;
ALTER TABLE public.sessions ALTER COLUMN academic_year DROP DEFAULT;
INSERT INTO public.academic_years(id,name) SELECT DISTINCT academic_year,academic_year FROM public.sessions WHERE nullif(btrim(academic_year),'') IS NOT NULL ON CONFLICT DO NOTHING;
INSERT INTO public.academic_years(id,name) SELECT DISTINCT academic_year,academic_year FROM public.class_session_plans ON CONFLICT DO NOTHING;
INSERT INTO public.academic_years(id,name) SELECT DISTINCT academic_year,academic_year FROM public.session_assignment_targets ON CONFLICT DO NOTHING;
-- Unlinked legacy exam records remain unassigned; never guess their year.
CREATE OR REPLACE FUNCTION public.academic_record_year() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE yr text; s sessions%ROWTYPE;
BEGIN
 IF TG_OP='UPDATE' AND OLD.academic_year IS DISTINCT FROM NEW.academic_year THEN RAISE EXCEPTION 'Academic year is immutable. Create a new record for the new year'; END IF;
 IF TG_TABLE_NAME IN ('clicker_records','assessment_results') THEN
  SELECT academic_year INTO yr FROM assessments WHERE assessment_id=NEW.assessment_id;
  IF NEW.academic_year IS NOT NULL AND NEW.academic_year IS DISTINCT FROM yr THEN RAISE EXCEPTION 'Assessment academic year mismatch'; END IF;
  NEW.academic_year:=yr;
 ELSIF TG_TABLE_NAME='session_division_status' THEN
  SELECT * INTO s FROM sessions WHERE id=NEW.session_id;
  IF NOT FOUND OR (s.school_id,s.unit,s.class) IS DISTINCT FROM (NEW.school_id,NEW.unit,NEW.class) THEN RAISE EXCEPTION 'Session school/unit/class mismatch'; END IF;
  NEW.academic_year:=s.academic_year;
 ELSE NEW.academic_year:=coalesce(nullif(NEW.academic_year,''),academic_selected_year()); END IF;
 IF TG_OP='INSERT' AND NEW.academic_year IS DISTINCT FROM academic_selected_year() THEN RAISE EXCEPTION 'Record does not belong to the selected academic year'; END IF;
 IF NOT EXISTS(SELECT 1 FROM academic_years WHERE id=NEW.academic_year) THEN RAISE EXCEPTION 'Select a configured academic year'; END IF;
 RETURN NEW;
END $$;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['sessions','session_division_status','attendance','clicker_records','assessment_results','assessments','exam_scores'] LOOP
  EXECUTE format('DROP TRIGGER IF EXISTS academic_record_year ON public.%I',t);
  EXECUTE format('CREATE TRIGGER academic_record_year BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.academic_record_year()',t);
  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I(academic_year,school_id)',t||'_academic_school',t);
 END LOOP;
END $$;
CREATE OR REPLACE FUNCTION public.academic_promote(p_source text,p_target text,p_rows jsonb,p_schools uuid[] DEFAULT NULL) RETURNS integer
LANGUAGE plpgsql SET search_path=public AS $$
DECLARE r jsonb; old student_enrollments%ROWTYPE; dest uuid; n integer:=0;
BEGIN
 IF p_source=p_target OR NOT EXISTS(SELECT 1 FROM academic_years WHERE id=p_target) THEN RAISE EXCEPTION 'Select a different target academic year'; END IF;
 IF jsonb_typeof(p_rows)<>'array' OR jsonb_array_length(p_rows) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'Select 1–500 enrollments'; END IF;
 LOCK TABLE student_enrollments IN SHARE ROW EXCLUSIVE MODE;
 FOR r IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
  SELECT * INTO old FROM student_enrollments WHERE id=(r->>'source_id')::uuid AND academic_year=p_source;
  IF NOT FOUND THEN RAISE EXCEPTION 'Source enrollment not found'; END IF;
  dest:=(r->>'school_id')::uuid;
  IF p_schools IS NOT NULL AND (NOT old.school_id=ANY(p_schools) OR NOT dest=ANY(p_schools)) THEN RAISE EXCEPTION 'School access denied'; END IF;
  IF nullif(btrim(r->>'class'),'') IS NULL THEN RAISE EXCEPTION 'Class is required'; END IF;
  INSERT INTO student_enrollments(student_id,academic_year,school_id,class,division,roll_number,status)
  VALUES(old.student_id,p_target,dest,btrim(r->>'class'),coalesce(r->>'division',''),coalesce(r->>'roll_number',''),coalesce(r->>'status','Active'));
  IF EXISTS(SELECT 1 FROM academic_years WHERE id=p_target AND is_current) THEN
   PERFORM set_config('request.headers',jsonb_build_object('x-academic-year',p_target)::text,true);
   UPDATE students SET school_id=dest,class=btrim(r->>'class'),division=coalesce(r->>'division',''),roll_number=coalesce(r->>'roll_number','') WHERE id=old.student_id;
  END IF;
  n:=n+1;
 END LOOP;
 RETURN n;
END $$;
CREATE OR REPLACE FUNCTION public.academic_set_current(p_year text) RETURNS void LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 LOCK TABLE academic_years IN SHARE ROW EXCLUSIVE MODE;
 IF NOT EXISTS(SELECT 1 FROM academic_years WHERE id=p_year) THEN RAISE EXCEPTION 'Unknown academic year'; END IF;
 UPDATE academic_years SET is_current=false WHERE is_current;
 UPDATE academic_years SET is_current=true WHERE id=p_year;
 PERFORM set_config('request.headers',jsonb_build_object('x-academic-year',p_year)::text,true);
 UPDATE students s SET school_id=e.school_id,class=e.class,division=e.division,roll_number=e.roll_number
 FROM student_enrollments e WHERE e.student_id=s.id AND e.academic_year=p_year;
END $$;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['academic_years','student_enrollments'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',t);
  EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
  EXECUTE format('DROP POLICY IF EXISTS academic_server ON public.%I',t);
  EXECUTE format('CREATE POLICY academic_server ON public.%I FOR ALL TO service_role USING(true) WITH CHECK(true)',t);
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.academic_promote(text,text,jsonb,uuid[]),public.academic_set_current(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.academic_promote(text,text,jsonb,uuid[]),public.academic_set_current(text) TO service_role;
CREATE TABLE IF NOT EXISTS public.question_set_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, exam_type text NOT NULL,
 class text NOT NULL, academic_year text REFERENCES academic_years(id), questions jsonb NOT NULL CHECK(jsonb_typeof(questions)='array' AND jsonb_array_length(questions)>0), created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.question_set_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.question_set_versions FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON public.question_set_versions TO service_role;
DROP POLICY IF EXISTS academic_version_server ON public.question_set_versions;
CREATE POLICY academic_version_server ON public.question_set_versions FOR ALL TO service_role USING(true) WITH CHECK(true);
ALTER TABLE public.assessments ADD COLUMN IF NOT EXISTS question_set_version_id uuid REFERENCES public.question_set_versions(id);
ALTER TABLE public.assessments ADD COLUMN IF NOT EXISTS question_snapshot jsonb;
-- Use an existing evaluation snapshot when one is available. Per-student snapshots
-- remain authoritative if legacy evaluations used different keys.
UPDATE public.assessments a SET question_snapshot=(SELECT c.question_snapshot FROM public.clicker_records c WHERE c.assessment_id=a.assessment_id AND c.question_snapshot IS NOT NULL ORDER BY c.created_at,c.id LIMIT 1) WHERE a.question_snapshot IS NULL;
CREATE OR REPLACE FUNCTION public.academic_assessment_pin() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE v question_set_versions%ROWTYPE;
BEGIN
 IF TG_OP='UPDATE' AND (OLD.question_snapshot IS NOT NULL OR EXISTS(SELECT 1 FROM clicker_records WHERE assessment_id=OLD.assessment_id)) THEN
  IF (NEW.assessment_id,NEW.school_id,NEW.class,NEW.section,NEW.exam_type,NEW.academic_year,NEW.question_set_version_id) IS DISTINCT FROM (OLD.assessment_id,OLD.school_id,OLD.class,OLD.section,OLD.exam_type,OLD.academic_year,OLD.question_set_version_id) THEN RAISE EXCEPTION 'Evaluated assessment context is preserved. Create a new assessment'; END IF;
  IF OLD.question_snapshot IS NOT NULL THEN NEW.question_snapshot:=OLD.question_snapshot; END IF;
 END IF;
 IF TG_OP='UPDATE' AND OLD.status='Completed' AND NEW.status IS DISTINCT FROM OLD.status THEN RAISE EXCEPTION 'Completed assessments cannot be reopened'; END IF;
 IF NEW.question_snapshot IS NULL AND NEW.question_set_version_id IS NOT NULL THEN
  SELECT * INTO v FROM question_set_versions WHERE id=NEW.question_set_version_id;
  IF NOT FOUND OR v.exam_type<>upper(btrim(NEW.exam_type)) OR v.class<>question_class(NEW.class) OR (v.academic_year IS NOT NULL AND v.academic_year<>NEW.academic_year) THEN RAISE EXCEPTION 'Question set version does not match assessment year, exam type and class'; END IF;
  NEW.question_snapshot:=v.questions;
 END IF;
 IF NEW.status='Completed' AND NEW.question_snapshot IS NULL THEN
  LOCK TABLE question_bank IN SHARE MODE;
  SELECT jsonb_agg(to_jsonb(b) ORDER BY question_no) INTO NEW.question_snapshot FROM question_bank b WHERE b.exam_type=upper(btrim(NEW.exam_type)) AND b.class=question_class(NEW.class);
  IF NEW.question_snapshot IS NULL THEN RAISE EXCEPTION 'Add the answer key before completing this assessment'; END IF;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS academic_assessment_pin ON public.assessments;
CREATE TRIGGER academic_assessment_pin BEFORE INSERT OR UPDATE ON public.assessments FOR EACH ROW EXECUTE FUNCTION public.academic_assessment_pin();
CREATE OR REPLACE FUNCTION public.academic_school_counts() RETURNS jsonb LANGUAGE sql STABLE SET search_path=public AS $$
 SELECT coalesce(jsonb_object_agg(school_id,n),'{}') FROM (SELECT school_id,count(*) n FROM academic_roster GROUP BY school_id) t;
$$;
REVOKE ALL ON FUNCTION public.academic_school_counts() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.academic_school_counts() TO service_role;
CREATE OR REPLACE FUNCTION public.evaluate_universal_clicker() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE a assessments%ROWTYPE;s student_enrollments%ROWTYPE;enabled boolean;q record;k text;v text;n integer;keys jsonb:='{}';answer text;
BEGIN
 NEW.exam_type:=upper(btrim(coalesce(NEW.exam_type,'')));NEW.class:=question_class(NEW.class);
 IF NEW.exam_type='' OR NEW.class='' THEN RAISE EXCEPTION 'Exam Type and Class are required for Clicker evaluation'; END IF;
 SELECT visible INTO enabled FROM exam_types WHERE name=NEW.exam_type FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown Exam Type: %',NEW.exam_type; END IF;
 IF NOT enabled THEN RAISE EXCEPTION 'Question Set Inactive: This Exam Type is currently hidden in Question Master and cannot be used for Clicker evaluation.'; END IF;
 SELECT * INTO a FROM assessments WHERE assessment_id=NEW.assessment_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Select an assessment for school and session context'; END IF;
 IF upper(btrim(a.exam_type))<>NEW.exam_type OR question_class(a.class)<>NEW.class THEN RAISE EXCEPTION 'Assessment Exam Type and Class must match the Clicker row exactly'; END IF;
 IF a.school_id IS NULL OR (NEW.school_id IS NOT NULL AND NEW.school_id<>a.school_id) THEN RAISE EXCEPTION 'Assessment school does not match Clicker school'; END IF;
 NEW.school_id:=a.school_id;NEW.school_name:=a.school_name;
 IF EXISTS(SELECT 1 FROM clicker_records c WHERE c.assessment_id=NEW.assessment_id AND c.id<>NEW.id AND (c.keypad_id=NEW.keypad_id OR (NEW.student_id IS NOT NULL AND c.student_id=NEW.student_id))) THEN RAISE EXCEPTION 'Duplicate Clicker record for this assessment and keypad/student. Edit the existing record.'; END IF;
 IF NEW.student_id IS NOT NULL THEN
  SELECT * INTO s FROM student_enrollments WHERE student_id=NEW.student_id AND academic_year=a.academic_year;
  IF NOT FOUND OR s.school_id<>NEW.school_id OR question_class(s.class)<>NEW.class OR (NEW.section IS NOT NULL AND upper(btrim(s.division))<>upper(btrim(NEW.section))) THEN RAISE EXCEPTION 'Student school, class or section does not match'; END IF;
 END IF;
 IF jsonb_typeof(NEW.answers) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Answers must be an object'; END IF;
 -- Keep the selected key set stable through the whole transaction, including concurrent inserts.
 LOCK TABLE question_bank IN SHARE MODE;
 IF TG_OP='UPDATE' AND OLD.question_snapshot IS NOT NULL THEN
  IF (NEW.exam_type,NEW.class,NEW.assessment_id) IS DISTINCT FROM (OLD.exam_type,OLD.class,OLD.assessment_id) THEN RAISE EXCEPTION 'Evaluated exam context cannot change. Create a new assessment record'; END IF;
  NEW.question_snapshot:=OLD.question_snapshot;
 ELSE
  IF a.question_snapshot IS NULL THEN
   SELECT jsonb_agg(to_jsonb(b) ORDER BY question_no) INTO a.question_snapshot FROM question_bank b WHERE exam_type=NEW.exam_type AND class=NEW.class;
   UPDATE assessments SET question_snapshot=a.question_snapshot WHERE id=a.id;
  END IF;
  NEW.question_snapshot:=a.question_snapshot;
 END IF;
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
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.question_snapshot) b WHERE (b->>'question_no')::int=substring(k FROM 2)::int) THEN
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

  IF p_table IN ('assessments','clicker_records') THEN predicate:=predicate||' AND t.academic_year=public.academic_selected_year()'; END IF;
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
    EXECUTE format('SELECT coalesce(jsonb_agg(k ORDER BY substring(k,2)::int),''[]''::jsonb) FROM (SELECT DISTINCT upper(keys.k) k FROM public.clicker_records c CROSS JOIN LATERAL jsonb_object_keys(c.answers) keys(k) WHERE c.academic_year=public.academic_selected_year() AND upper(keys.k) ~ ''^S[0-9]+$'' AND (%L=''all'' OR c.assessment_id=%L) AND (%L::uuid[] IS NULL OR c.school_id=ANY(%L::uuid[]))) cols', p_assessment, p_assessment, p_schools, p_schools) INTO columns;
  END IF;
  RETURN jsonb_build_object('rows', result, 'total', total, 'questionColumns', columns);
END $$;

-- Make paged student/report reads consume enrollment identity and year-scoped scores.
DO $$ DECLARE f record; body text; BEGIN
 FOR f IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('student_details_page','performance_student_page','performance_student_facets','performance_import_students') LOOP
  body:=pg_get_functiondef(f.oid);
  IF position('performance_import_students(' in body)>0 THEN
   body:=replace(body,'WHERE school_id=p_school AND starts_with(student_code,prefix)','WHERE starts_with(student_code,prefix)');
   body:=replace(body,'IF EXISTS(SELECT 1 FROM public.students','IF EXISTS(SELECT 1 FROM public.academic_roster');
  ELSE
  body:=replace(body,'public.students','public.academic_roster');
  body:=replace(body,'FROM students','FROM public.academic_roster');
  body:=replace(body,'public.exam_scores e','(SELECT * FROM public.exam_scores WHERE academic_year=public.academic_selected_year()) e');
  body:=replace(body,'public.attendance a','(SELECT * FROM public.attendance WHERE academic_year=public.academic_selected_year()) a');
  END IF;
  EXECUTE body;
 END LOOP;
END $$;
CREATE OR REPLACE FUNCTION public.academic_student_history(p_student uuid,p_schools uuid[] DEFAULT NULL) RETURNS jsonb LANGUAGE sql STABLE SET search_path=public AS $$
 SELECT jsonb_build_object(
 'enrollments',(SELECT coalesce(jsonb_agg(to_jsonb(e)||jsonb_build_object('school_name',s.name) ORDER BY e.academic_year),'[]') FROM student_enrollments e JOIN schools s ON e.school_id=s.id WHERE e.student_id=p_student AND (p_schools IS NULL OR e.school_id=ANY(p_schools))),
 'results',(SELECT coalesce(jsonb_agg(r ORDER BY r.academic_year,r.calculated_at),'[]') FROM assessment_results r WHERE r.student_id=p_student AND (p_schools IS NULL OR r.school_id=ANY(p_schools))),
 'scores',(SELECT coalesce(jsonb_agg(r ORDER BY r.academic_year,r.updated_at),'[]') FROM exam_scores r WHERE r.student_id=p_student AND (p_schools IS NULL OR r.school_id=ANY(p_schools))),
 'attendance',(SELECT coalesce(jsonb_agg(t),'[]') FROM (SELECT academic_year,round(100.0*count(*) FILTER(WHERE status='present')/nullif(count(*),0),1) percentage FROM attendance WHERE student_id=p_student AND (p_schools IS NULL OR school_id=ANY(p_schools)) GROUP BY academic_year) t),
 'sessions',(SELECT coalesce(jsonb_agg(t),'[]') FROM (SELECT e.academic_year,u.unit,count(s.id) total,count(s.id) FILTER(WHERE d.status='complete') complete FROM student_enrollments e CROSS JOIN (VALUES('Unit-1'),('Unit-2'),('Unit-3'),('Unit-4')) u(unit) LEFT JOIN sessions s ON s.school_id=e.school_id AND s.academic_year=e.academic_year AND s.class=e.class AND s.unit=u.unit LEFT JOIN session_division_status d ON d.session_id=s.id AND d.division=e.division AND d.academic_year=e.academic_year WHERE e.student_id=p_student AND (p_schools IS NULL OR e.school_id=ANY(p_schools)) GROUP BY e.academic_year,u.unit) t)
 );
$$;
REVOKE ALL ON FUNCTION public.academic_student_history(uuid,uuid[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.academic_student_history(uuid,uuid[]) TO service_role;

CREATE OR REPLACE FUNCTION public.academic_capture_question_set(p_exam text,p_class text,p_name text,p_year text DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SET search_path=public AS $$
DECLARE qs jsonb; result uuid;
BEGIN
 LOCK TABLE question_bank IN SHARE MODE;
 SELECT jsonb_agg(to_jsonb(q) ORDER BY question_no) INTO qs FROM question_bank q WHERE exam_type=upper(btrim(p_exam)) AND class=question_class(p_class);
 IF qs IS NULL THEN RAISE EXCEPTION 'No questions for this exam type and class'; END IF;
 INSERT INTO question_set_versions(name,exam_type,class,academic_year,questions) VALUES(btrim(p_name),upper(btrim(p_exam)),question_class(p_class),p_year,qs) RETURNING id INTO result;
 RETURN result;
END $$;
CREATE OR REPLACE FUNCTION public.academic_next_student_code(p_school uuid) RETURNS text LANGUAGE plpgsql SET search_path=public AS $$
DECLARE prefix text; seq bigint;
BEGIN
 SELECT code||'-STU' INTO prefix FROM schools WHERE id=p_school;
 IF prefix IS NULL THEN RAISE EXCEPTION 'School code is required'; END IF;
 SELECT coalesce(max(substring(student_code,length(prefix)+1)::bigint),0)+1 INTO seq FROM students WHERE starts_with(student_code,prefix) AND substring(student_code,length(prefix)+1) ~ '^[0-9]+$';
 RETURN prefix||lpad(seq::text,greatest(6,length(seq::text)),'0');
END $$;
CREATE OR REPLACE FUNCTION public.academic_unique_new_identity() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM students WHERE id=NEW.id) THEN RETURN NEW; END IF;
 PERFORM pg_advisory_xact_lock(hashtext(NEW.student_code));
 IF EXISTS(SELECT 1 FROM students WHERE student_code=NEW.student_code) THEN RAISE EXCEPTION 'Student ID already exists. Promote the existing student or choose a different ID' USING ERRCODE='23505'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS academic_unique_new_identity ON public.students;
CREATE TRIGGER academic_unique_new_identity BEFORE INSERT ON public.students FOR EACH ROW EXECUTE FUNCTION public.academic_unique_new_identity();
REVOKE ALL ON FUNCTION public.academic_capture_question_set(text,text,text,text),public.academic_next_student_code(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.academic_capture_question_set(text,text,text,text),public.academic_next_student_code(uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
