-- Allow ordinary Assessment Master edits after evaluation.
--
-- The assessment identity/context remains immutable once clicker data exists:
-- assessment_id, school, class, section, exam type, academic year and question-set
-- version must continue to match the evaluated records. Descriptive and scoring
-- metadata may be corrected without creating a replacement assessment.
CREATE OR REPLACE FUNCTION public.academic_assessment_pin()
RETURNS trigger
LANGUAGE plpgsql
SET search_path=public AS $$
DECLARE
  v question_set_versions%ROWTYPE;
BEGIN
  IF TG_OP='UPDATE'
     AND (OLD.question_snapshot IS NOT NULL
          OR EXISTS (SELECT 1 FROM clicker_records WHERE assessment_id=OLD.assessment_id)) THEN
    IF (NEW.assessment_id,
        NEW.school_id,
        NEW.class,
        NEW.section,
        NEW.exam_type,
        NEW.academic_year,
        NEW.question_set_version_id)
       IS DISTINCT FROM
       (OLD.assessment_id,
        OLD.school_id,
        OLD.class,
        OLD.section,
        OLD.exam_type,
        OLD.academic_year,
        OLD.question_set_version_id) THEN
      RAISE EXCEPTION 'Evaluated assessment context is preserved. Only non-context fields can be edited.';
    END IF;

    -- Never replace the answer-key snapshot that the evaluated records used.
    IF OLD.question_snapshot IS NOT NULL THEN
      NEW.question_snapshot := OLD.question_snapshot;
    END IF;
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

DROP TRIGGER IF EXISTS academic_assessment_pin ON public.assessments;
CREATE TRIGGER academic_assessment_pin
BEFORE INSERT OR UPDATE ON public.assessments
FOR EACH ROW EXECUTE FUNCTION public.academic_assessment_pin();
