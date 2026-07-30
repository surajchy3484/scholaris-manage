ALTER TABLE public.students ADD COLUMN IF NOT EXISTS enrollment_date date;
UPDATE public.students SET enrollment_date = created_at::date WHERE enrollment_date IS NULL;
ALTER TABLE public.students ALTER COLUMN enrollment_date SET DEFAULT CURRENT_DATE;

CREATE TABLE public.exam_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  student_id uuid NOT NULL,
  exam_type text NOT NULL DEFAULT 'ICA',
  subject text,
  academic_year text NOT NULL DEFAULT to_char(CURRENT_DATE, 'YYYY'),
  score numeric(5,2) NOT NULL DEFAULT 0,
  remarks text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.exam_scores TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.exam_scores TO authenticated;
GRANT ALL ON public.exam_scores TO service_role;

ALTER TABLE public.exam_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public exam_scores all" ON public.exam_scores FOR ALL USING (true) WITH CHECK (true);

CREATE UNIQUE INDEX exam_scores_unique_key ON public.exam_scores (student_id, exam_type, academic_year, COALESCE(subject, ''));
CREATE INDEX exam_scores_school_idx ON public.exam_scores (school_id);

CREATE OR REPLACE FUNCTION public.tg_exam_scores_validate()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.score < 0 OR NEW.score > 100 THEN
    RAISE EXCEPTION 'score must be between 0 and 100';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER exam_scores_validate BEFORE INSERT OR UPDATE ON public.exam_scores
FOR EACH ROW EXECUTE FUNCTION public.tg_exam_scores_validate();

CREATE TRIGGER exam_scores_updated_at BEFORE UPDATE ON public.exam_scores
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();