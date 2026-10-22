-- Master corrections do not regrade existing Clicker responses.
BEGIN;
ALTER TABLE public.assessments ADD COLUMN IF NOT EXISTS preserved_context jsonb;
CREATE OR REPLACE VIEW public.assessment_evaluation_context AS
 SELECT (jsonb_populate_record(NULL::public.assessments,
   to_jsonb(a) || coalesce(a.preserved_context,'{}'::jsonb) ||
   jsonb_build_object('id',a.id,'assessment_id',a.assessment_id))).*
 FROM public.assessments a;
REVOKE ALL ON public.assessment_evaluation_context FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.assessment_evaluation_context TO service_role;
CREATE OR REPLACE FUNCTION public.academic_assessment_pin()
RETURNS trigger
LANGUAGE plpgsql
SET search_path=public AS $$
DECLARE
  v question_set_versions%ROWTYPE;
BEGIN
  IF TG_OP='UPDATE' AND NEW.assessment_id IS DISTINCT FROM OLD.assessment_id THEN
    IF EXISTS(SELECT 1 FROM clicker_records WHERE assessment_id=NEW.assessment_id)
       OR EXISTS(SELECT 1 FROM assessment_results WHERE assessment_id=NEW.assessment_id)
       OR EXISTS(SELECT 1 FROM questions WHERE assessment_id=NEW.assessment_id)
       OR EXISTS(SELECT 1 FROM question_bank_migration_issues WHERE assessment_id=NEW.assessment_id) THEN
      RAISE EXCEPTION 'Assessment ID already has linked records. Choose an unused ID.';
    END IF;
  END IF;
  IF TG_OP='UPDATE' THEN
    -- Snapshot all original assessment metadata once. This is never accepted
    -- from the client and cannot be replaced by subsequent Master corrections.
    NEW.preserved_context := OLD.preserved_context;
    IF OLD.preserved_context IS NOT NULL
       OR EXISTS(SELECT 1 FROM clicker_records WHERE assessment_id=OLD.assessment_id)
       OR EXISTS(SELECT 1 FROM assessment_results WHERE assessment_id=OLD.assessment_id) THEN
      NEW.preserved_context := coalesce(OLD.preserved_context, to_jsonb(OLD)-'preserved_context');
      NEW.question_snapshot := OLD.question_snapshot;
      RETURN NEW;
    END IF;
    IF (NEW.exam_type,NEW.class,NEW.question_set_version_id)
       IS DISTINCT FROM (OLD.exam_type,OLD.class,OLD.question_set_version_id) THEN
      NEW.question_snapshot := NULL;
    END IF;
  ELSE NEW.preserved_context := NULL;
  END IF;

  -- Status is intentionally not protected here: administrators may correct a
  -- workflow label (for example, Completed -> Active) without changing the
  -- evaluated answer key or result rows.
  IF NEW.question_snapshot IS NULL AND NEW.question_set_version_id IS NOT NULL THEN
    SELECT * INTO v
    FROM question_set_versions
    WHERE id=NEW.question_set_version_id;

    IF NOT FOUND
       OR v.exam_type<>upper(btrim(NEW.exam_type))
       OR v.class<>question_class(NEW.class)
       OR (v.academic_year IS NOT NULL AND v.academic_year<>NEW.academic_year) THEN
      RAISE EXCEPTION 'Question set version does not match assessment year, exam type and class';
    END IF;

    NEW.question_snapshot := v.questions;
  END IF;

  IF NEW.status='Completed' AND NEW.question_snapshot IS NULL THEN
    LOCK TABLE question_bank IN SHARE MODE;
    SELECT jsonb_agg(to_jsonb(b) ORDER BY question_no)
      INTO NEW.question_snapshot
    FROM question_bank b
    WHERE b.exam_type=upper(btrim(NEW.exam_type))
      AND b.class=question_class(NEW.class);

    IF NEW.question_snapshot IS NULL THEN
      RAISE EXCEPTION 'Add the answer key before completing this assessment';
    END IF;
  END IF;

  RETURN NEW;
END $$;


DO $$
DECLARE definition text;
BEGIN
 SELECT pg_get_functiondef('public.evaluate_universal_clicker()'::regprocedure) INTO definition;
 IF position('SELECT * INTO a FROM assessments WHERE assessment_id=NEW.assessment_id FOR UPDATE;' in definition)>0 THEN
   definition := replace(definition,
     'SELECT * INTO a FROM assessments WHERE assessment_id=NEW.assessment_id FOR UPDATE;',
     'PERFORM 1 FROM assessments WHERE assessment_id=NEW.assessment_id FOR UPDATE; SELECT * INTO a FROM assessment_evaluation_context WHERE assessment_id=NEW.assessment_id; IF a.preserved_context IS NOT NULL AND a.question_snapshot IS NULL THEN RAISE EXCEPTION ''Original answer key is unavailable. Create a new assessment for additional responses; existing results are unchanged.''; END IF;');
 ELSIF position('SELECT * INTO a FROM assessment_evaluation_context' in definition)=0 THEN
   RAISE EXCEPTION 'Unrecognized Clicker evaluator. No changes applied.';
 END IF;
 definition := replace(definition,'FROM assessments parent WHERE','FROM assessment_evaluation_context parent WHERE');
 EXECUTE definition;
 SELECT pg_get_functiondef('public.academic_record_year()'::regprocedure) INTO definition;
 definition := replace(definition,
   'SELECT academic_year INTO yr FROM assessments WHERE assessment_id=NEW.assessment_id;',
   'SELECT academic_year INTO yr FROM assessment_evaluation_context WHERE assessment_id=NEW.assessment_id;');
 -- Only the editable Master row may move years. Saved evaluations stay put.
 definition := replace(definition,
   'IF TG_OP=''UPDATE'' AND OLD.academic_year IS DISTINCT FROM NEW.academic_year THEN',
   'IF TG_OP=''UPDATE'' AND TG_TABLE_NAME=''assessments'' AND OLD.academic_year IS DISTINCT FROM NEW.academic_year AND NOT EXISTS(SELECT 1 FROM academic_years y WHERE y.id=NEW.academic_year AND NOT coalesce((to_jsonb(y)->>''is_archived'')::boolean,false)) THEN RAISE EXCEPTION ''Choose an available academic year''; END IF; IF TG_OP=''UPDATE'' AND TG_TABLE_NAME<>''assessments'' AND OLD.academic_year IS DISTINCT FROM NEW.academic_year THEN');
 EXECUTE definition;
 SELECT pg_get_functiondef('public.universal_clicker_write(text,jsonb,uuid[],jsonb,uuid[])'::regprocedure) INTO definition;
 definition := replace(definition,'FROM assessments','FROM assessment_evaluation_context');
 definition := replace(definition,'JOIN assessments','JOIN assessment_evaluation_context');
 EXECUTE definition;
 SELECT pg_get_functiondef('public.delete_assessments(uuid[],uuid[])'::regprocedure) INTO definition;
 -- Authorization/existence checks use editable Master context. Only score
 -- context uses the original evaluation metadata when deleting linked results.
 definition := replace(definition,'FROM assessments a JOIN (','FROM assessment_evaluation_context a JOIN (');
 definition := replace(definition,'JOIN assessments a USING(assessment_id)','JOIN assessment_evaluation_context a USING(assessment_id)');
 EXECUTE definition;
END $$;
NOTIFY pgrst, 'reload schema';
COMMIT;
