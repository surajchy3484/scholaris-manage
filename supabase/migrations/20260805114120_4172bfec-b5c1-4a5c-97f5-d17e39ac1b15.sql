ALTER TABLE public.assessments
  ADD COLUMN IF NOT EXISTS academic_year text NOT NULL DEFAULT to_char(CURRENT_DATE, 'YYYY'),
  ADD COLUMN IF NOT EXISTS subject text,
  ADD COLUMN IF NOT EXISTS total_marks integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS passing_marks integer NOT NULL DEFAULT 0;

ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS question_text text,
  ADD COLUMN IF NOT EXISTS marks numeric NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS difficulty text NOT NULL DEFAULT 'Medium',
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'Active',
  ADD COLUMN IF NOT EXISTS subject text;

ALTER TABLE public.clicker_records
  ADD COLUMN IF NOT EXISTS roll_number text;

CREATE INDEX IF NOT EXISTS questions_assessment_idx ON public.questions (assessment_id, question_no);
CREATE INDEX IF NOT EXISTS clicker_assessment_idx ON public.clicker_records (assessment_id);
CREATE INDEX IF NOT EXISTS assessments_code_idx ON public.assessments (assessment_id);