CREATE TABLE public.school_divisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  class text NOT NULL DEFAULT '',
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, class, name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.school_divisions TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.school_divisions TO authenticated;
GRANT ALL ON public.school_divisions TO service_role;

ALTER TABLE public.school_divisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can manage school divisions"
  ON public.school_divisions FOR ALL
  USING (true) WITH CHECK (true);

CREATE TRIGGER update_school_divisions_updated_at
  BEFORE UPDATE ON public.school_divisions
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_school_divisions_school_class
  ON public.school_divisions (school_id, class, sort_order);

CREATE INDEX IF NOT EXISTS idx_sessions_school_unit_class
  ON public.sessions (school_id, unit, class);
CREATE INDEX IF NOT EXISTS idx_sds_lookup
  ON public.session_division_status (school_id, unit, class, division);
CREATE INDEX IF NOT EXISTS idx_students_school_class_div
  ON public.students (school_id, class, division);
CREATE INDEX IF NOT EXISTS idx_students_name ON public.students (name);
CREATE INDEX IF NOT EXISTS idx_questions_assessment ON public.questions (assessment_id);
CREATE INDEX IF NOT EXISTS idx_clicker_assessment ON public.clicker_records (assessment_id);
CREATE INDEX IF NOT EXISTS idx_exam_scores_student ON public.exam_scores (student_id);