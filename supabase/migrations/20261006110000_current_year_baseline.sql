-- One-time baseline correction requested before genuine multi-year operation begins.
-- Atomic: uniqueness conflicts abort the entire reset instead of overwriting scores.
BEGIN;
ALTER TABLE public.academic_years ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false;
CREATE TABLE IF NOT EXISTS public.academic_year_baselines (
  id text PRIMARY KEY, academic_year text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.academic_year_reset_backup (
  baseline text NOT NULL, source_table text NOT NULL, record_id text NOT NULL,
  original_record jsonb NOT NULL, saved_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (baseline,source_table,record_id)
);
ALTER TABLE public.academic_year_baselines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academic_year_reset_backup ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.academic_year_baselines,public.academic_year_reset_backup FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.academic_year_baselines,public.academic_year_reset_backup TO service_role;

DO $$
DECLARE yr text; t text; trigger_row record;
  tables text[] := ARRAY['academic_years','students','student_enrollments','assessments','clicker_records',
    'assessment_results','exam_scores','sessions','session_division_status','attendance',
    'class_session_plans','session_assignment_targets','question_set_versions'];
BEGIN
  LOCK TABLE public.academic_year_baselines IN EXCLUSIVE MODE;
  IF EXISTS(SELECT 1 FROM public.academic_year_baselines WHERE id='current-year-baseline-v1') THEN RETURN; END IF;
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('LOCK TABLE public.%I IN ACCESS EXCLUSIVE MODE',t);
  END LOOP;
  SELECT id INTO STRICT yr FROM public.academic_years WHERE is_current;
  -- These records cannot be folded into one year without losing a distinct value.
  IF EXISTS(SELECT 1 FROM public.exam_scores GROUP BY student_id,exam_type,coalesce(subject,'') HAVING count(*)>1) THEN
    RAISE EXCEPTION 'Current-year correction stopped: conflicting exam scores across year labels. No records changed. Review the duplicate student/exam/subject records before retrying.';
  END IF;
  IF EXISTS(SELECT 1 FROM public.class_session_plans GROUP BY unit,class HAVING count(*)>1)
    OR EXISTS(SELECT 1 FROM public.session_assignment_targets GROUP BY school_id,unit,class,division HAVING count(*)>1) THEN
    RAISE EXCEPTION 'Current-year correction stopped: conflicting session plans across year labels. No records changed. Review the duplicate plans before retrying.';
  END IF;
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('INSERT INTO public.academic_year_reset_backup(baseline,source_table,record_id,original_record) SELECT %L,%L,id::text,to_jsonb(r) FROM public.%I r ON CONFLICT DO NOTHING','current-year-baseline-v1',t,t);
  END LOOP;
  -- Keep each trigger's original enabled state. Suppress evaluation/update hooks only
  -- inside this locked migration, so changing the year cannot recalculate old scores.
  CREATE TEMP TABLE baseline_triggers ON COMMIT DROP AS
    SELECT c.relname AS tablename,g.tgname,g.tgenabled FROM pg_trigger g
    JOIN pg_class c ON c.oid=g.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname=ANY(tables) AND NOT g.tgisinternal;
  FOR trigger_row IN SELECT * FROM baseline_triggers LOOP
    EXECUTE format('ALTER TABLE public.%I DISABLE TRIGGER %I',trigger_row.tablename,trigger_row.tgname);
  END LOOP;
  -- Duplicate enrollments are associations, not student identities or score records.
  -- Preserve their full original rows above, retain current (otherwise newest) enrollment.
  DELETE FROM public.student_enrollments e USING (
    SELECT id,row_number() OVER(PARTITION BY student_id ORDER BY (academic_year=yr) DESC,updated_at DESC,id) AS priority
    FROM public.student_enrollments
  ) duplicate WHERE e.id=duplicate.id AND duplicate.priority>1;
  UPDATE public.student_enrollments SET academic_year=yr WHERE academic_year IS DISTINCT FROM yr;
  INSERT INTO public.student_enrollments(student_id,academic_year,school_id,class,division,roll_number)
    SELECT s.id,yr,s.school_id,s.class,coalesce(s.division,''),coalesce(s.roll_number,'')
    FROM public.students s JOIN public.schools sch ON sch.id=s.school_id
    WHERE NOT EXISTS(SELECT 1 FROM public.student_enrollments e WHERE e.student_id=s.id AND e.academic_year=yr);
  FOREACH t IN ARRAY ARRAY['assessments','clicker_records','assessment_results','exam_scores','sessions',
    'session_division_status','attendance','class_session_plans','session_assignment_targets'] LOOP
    EXECUTE format('UPDATE public.%I SET academic_year=$1 WHERE academic_year IS DISTINCT FROM $1',t) USING yr;
  END LOOP;
  UPDATE public.question_set_versions SET academic_year=yr WHERE academic_year IS NOT NULL AND academic_year IS DISTINCT FROM yr;
  UPDATE public.academic_years SET is_archived=(id<>yr);
  UPDATE public.academic_years SET name='2026–27' WHERE id=yr AND id='2026' AND name='2026';
  FOR trigger_row IN SELECT * FROM baseline_triggers LOOP
    EXECUTE format('ALTER TABLE public.%I %s TRIGGER %I',trigger_row.tablename,
      CASE trigger_row.tgenabled WHEN 'D' THEN 'DISABLE' WHEN 'R' THEN 'ENABLE REPLICA' WHEN 'A' THEN 'ENABLE ALWAYS' ELSE 'ENABLE' END,
      trigger_row.tgname);
  END LOOP;
  INSERT INTO public.academic_year_baselines(id,academic_year) VALUES('current-year-baseline-v1',yr);
END $$;
-- All later year creation/promotion uses the existing separate enrollments. Never
-- run the reset from a save, import, year switch, or new-year creation operation.
CREATE OR REPLACE FUNCTION public.academic_set_current(p_year text) RETURNS void LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 LOCK TABLE academic_years IN SHARE ROW EXCLUSIVE MODE;
 IF NOT EXISTS(SELECT 1 FROM academic_years WHERE id=p_year AND NOT is_archived) THEN RAISE EXCEPTION 'Unknown or retired academic year'; END IF;
 UPDATE academic_years SET is_current=false WHERE is_current;
 UPDATE academic_years SET is_current=true WHERE id=p_year;
 PERFORM set_config('request.headers',jsonb_build_object('x-academic-year',p_year)::text,true);
 UPDATE students s SET school_id=e.school_id,class=e.class,division=e.division,roll_number=e.roll_number
 FROM student_enrollments e WHERE e.student_id=s.id AND e.academic_year=p_year;
END $$;
REVOKE ALL ON FUNCTION public.academic_set_current(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.academic_set_current(text) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
