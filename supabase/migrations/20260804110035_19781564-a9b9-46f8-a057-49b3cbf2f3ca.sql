-- Assessment Master
CREATE TABLE public.assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id text NOT NULL UNIQUE,
  exam_type text NOT NULL DEFAULT 'ICA',
  name text NOT NULL,
  date date,
  school_id uuid REFERENCES public.schools(id) ON DELETE SET NULL,
  school_name text,
  class text,
  section text,
  total_questions integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'Draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assessments TO anon, authenticated;
GRANT ALL ON public.assessments TO service_role;
ALTER TABLE public.assessments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public assessments all" ON public.assessments FOR ALL USING (true) WITH CHECK (true);
CREATE TRIGGER assessments_updated BEFORE UPDATE ON public.assessments FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE INDEX assessments_school_idx ON public.assessments(school_id);

-- Question Master
CREATE TABLE public.questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id text NOT NULL,
  question_no integer NOT NULL,
  correct_answer text NOT NULL DEFAULT 'A',
  parameter text,
  topic text,
  chapter text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (assessment_id, question_no)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.questions TO anon, authenticated;
GRANT ALL ON public.questions TO service_role;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public questions all" ON public.questions FOR ALL USING (true) WITH CHECK (true);
CREATE TRIGGER questions_updated BEFORE UPDATE ON public.questions FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE INDEX questions_assessment_idx ON public.questions(assessment_id);

-- Clicker Data
CREATE TABLE public.clicker_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id text,
  keypad_id text NOT NULL,
  student_name text NOT NULL DEFAULT '',
  student_id uuid REFERENCES public.students(id) ON DELETE SET NULL,
  school_id uuid REFERENCES public.schools(id) ON DELETE SET NULL,
  school_name text,
  class text,
  section text,
  team text,
  score numeric NOT NULL DEFAULT 0,
  correct_rate numeric NOT NULL DEFAULT 0,
  ranking integer,
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clicker_records TO anon, authenticated;
GRANT ALL ON public.clicker_records TO service_role;
ALTER TABLE public.clicker_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public clicker_records all" ON public.clicker_records FOR ALL USING (true) WITH CHECK (true);
CREATE TRIGGER clicker_records_updated BEFORE UPDATE ON public.clicker_records FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE INDEX clicker_assessment_idx ON public.clicker_records(assessment_id);
CREATE INDEX clicker_school_idx ON public.clicker_records(school_id);