-- Allow Assessment Master ID corrections while preserving evaluated context and links.
BEGIN;
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
  IF TG_OP='UPDATE'
     AND (OLD.question_snapshot IS NOT NULL
          OR EXISTS (SELECT 1 FROM clicker_records WHERE assessment_id=OLD.assessment_id)) THEN
    IF (NEW.school_id,
        NEW.class,
        NEW.section,
        NEW.exam_type,
        NEW.academic_year,
        NEW.question_set_version_id)
       IS DISTINCT FROM
       (OLD.school_id,
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

CREATE OR REPLACE FUNCTION public.evaluate_universal_clicker() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE a assessments%ROWTYPE;s student_enrollments%ROWTYPE;enabled boolean;q record;k text;v text;n integer;keys jsonb:='{}';answer text;
BEGIN

 -- An assessment rename cascades only its label. Do not re-evaluate saved answers.
 -- Require a nested trigger, an unchanged row, and the same pinned parent context.
 IF TG_OP='UPDATE' AND pg_trigger_depth()>1
    AND NEW.assessment_id IS DISTINCT FROM OLD.assessment_id
    AND (to_jsonb(NEW)-'assessment_id'-'updated_at') = (to_jsonb(OLD)-'assessment_id'-'updated_at')
    AND NOT EXISTS(SELECT 1 FROM assessments WHERE assessment_id=OLD.assessment_id)
    AND EXISTS(SELECT 1 FROM assessments parent WHERE parent.assessment_id=NEW.assessment_id
      AND parent.school_id IS NOT DISTINCT FROM OLD.school_id
      AND question_class(parent.class)=question_class(OLD.class)
      AND upper(btrim(parent.exam_type))=upper(btrim(OLD.exam_type))
      AND parent.academic_year IS NOT DISTINCT FROM OLD.academic_year
      AND parent.question_snapshot IS NOT DISTINCT FROM OLD.question_snapshot) THEN
   RETURN NEW;
 END IF;
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

CREATE OR REPLACE FUNCTION public.cascade_assessment_code()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF NEW.assessment_id IS DISTINCT FROM OLD.assessment_id THEN
   IF nullif(btrim(NEW.assessment_id),'') IS NULL THEN
     RAISE EXCEPTION 'Assessment ID is required';
   END IF;
   -- All updates share the parent's transaction: any conflict rolls back everything.
   UPDATE clicker_records SET assessment_id=NEW.assessment_id WHERE assessment_id=OLD.assessment_id;
   UPDATE assessment_results SET assessment_id=NEW.assessment_id WHERE assessment_id=OLD.assessment_id;
   UPDATE questions SET assessment_id=NEW.assessment_id WHERE assessment_id=OLD.assessment_id;
   UPDATE question_bank_migration_issues SET assessment_id=NEW.assessment_id WHERE assessment_id=OLD.assessment_id;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS cascade_assessment_code ON public.assessments;
CREATE TRIGGER cascade_assessment_code AFTER UPDATE OF assessment_id ON public.assessments
FOR EACH ROW EXECUTE FUNCTION public.cascade_assessment_code();

COMMIT;
