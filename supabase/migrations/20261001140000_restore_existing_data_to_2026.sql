-- Restore the existing deployment data to the single running academic year.
-- This changes only the academic-year label; rows, IDs, scores, answers and history remain intact.
BEGIN;

INSERT INTO public.academic_years(id, name, is_current)
VALUES ('2026', '2026', false)
ON CONFLICT (id) DO NOTHING;

-- Academic-year immutability triggers protect normal application writes. This
-- controlled migration intentionally consolidates the pre-existing 2026-27
-- labels into the requested 2026 year without deleting any records.
ALTER TABLE public.assessments DISABLE TRIGGER academic_record_year;
ALTER TABLE public.exam_scores DISABLE TRIGGER academic_record_year;
ALTER TABLE public.sessions DISABLE TRIGGER academic_record_year;
ALTER TABLE public.session_division_status DISABLE TRIGGER academic_record_year;
ALTER TABLE public.attendance DISABLE TRIGGER academic_record_year;
ALTER TABLE public.clicker_records DISABLE TRIGGER academic_record_year;
ALTER TABLE public.assessment_results DISABLE TRIGGER academic_record_year;

UPDATE public.assessments SET academic_year = '2026' WHERE academic_year = '2026-27';
UPDATE public.exam_scores SET academic_year = '2026' WHERE academic_year = '2026-27';
UPDATE public.sessions SET academic_year = '2026' WHERE academic_year = '2026-27';
UPDATE public.session_division_status SET academic_year = '2026' WHERE academic_year = '2026-27';
UPDATE public.attendance SET academic_year = '2026' WHERE academic_year = '2026-27';
UPDATE public.clicker_records SET academic_year = '2026' WHERE academic_year = '2026-27';
UPDATE public.assessment_results SET academic_year = '2026' WHERE academic_year = '2026-27';
UPDATE public.question_set_versions SET academic_year = '2026' WHERE academic_year = '2026-27';
UPDATE public.class_session_plans SET academic_year = '2026' WHERE academic_year = '2026-27';
UPDATE public.session_assignment_targets SET academic_year = '2026' WHERE academic_year = '2026-27';

ALTER TABLE public.assessments ENABLE TRIGGER academic_record_year;
ALTER TABLE public.exam_scores ENABLE TRIGGER academic_record_year;
ALTER TABLE public.sessions ENABLE TRIGGER academic_record_year;
ALTER TABLE public.session_division_status ENABLE TRIGGER academic_record_year;
ALTER TABLE public.attendance ENABLE TRIGGER academic_record_year;
ALTER TABLE public.clicker_records ENABLE TRIGGER academic_record_year;
ALTER TABLE public.assessment_results ENABLE TRIGGER academic_record_year;

-- Ensure every existing student has a 2026 enrollment for the academic roster.
INSERT INTO public.student_enrollments(
  student_id, academic_year, school_id, class, division, roll_number, status
)
SELECT
  s.id,
  '2026',
  s.school_id,
  s.class,
  coalesce(s.division, ''),
  coalesce(s.roll_number, ''),
  'Active'
FROM public.students s
WHERE s.school_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.student_enrollments e
    WHERE e.student_id = s.id AND e.academic_year = '2026'
  );

UPDATE public.academic_years
SET is_current = (id = '2026');

COMMIT;
