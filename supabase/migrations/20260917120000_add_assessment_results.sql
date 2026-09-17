-- Centralized, immutable assessment result snapshot.
-- Clicker rows remain the raw response/import record; this table is the reporting source of truth.
CREATE TABLE IF NOT EXISTS public.assessment_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id text NOT NULL,
  keypad_id text,
  student_id uuid REFERENCES public.students(id) ON DELETE SET NULL,
  student_name text NOT NULL DEFAULT '',
  school_id uuid REFERENCES public.schools(id) ON DELETE SET NULL,
  school_name text,
  class text,
  section text,
  score numeric NOT NULL DEFAULT 0,
  total_questions integer NOT NULL DEFAULT 0,
  correct_answers integer NOT NULL DEFAULT 0,
  wrong_answers integer NOT NULL DEFAULT 0,
  correct_rate numeric NOT NULL DEFAULT 0,
  ranking integer,
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  calculated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (assessment_id, keypad_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.assessment_results TO anon, authenticated;
GRANT ALL ON public.assessment_results TO service_role;
ALTER TABLE public.assessment_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public assessment_results all" ON public.assessment_results FOR ALL USING (true) WITH CHECK (true);
CREATE TRIGGER assessment_results_updated BEFORE UPDATE ON public.assessment_results FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE INDEX IF NOT EXISTS assessment_results_assessment_idx ON public.assessment_results(assessment_id);
CREATE INDEX IF NOT EXISTS assessment_results_student_idx ON public.assessment_results(student_id);
CREATE INDEX IF NOT EXISTS assessment_results_school_class_idx ON public.assessment_results(school_id, class, section);
