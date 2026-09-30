-- Session assignment plans are separate from the individual session rows so target changes
-- never overwrite completion history or assignments from another academic year.
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS academic_year text NOT NULL DEFAULT to_char(CURRENT_DATE, 'YYYY'),
  ADD COLUMN IF NOT EXISTS assignment_type text NOT NULL DEFAULT 'School-wise',
  ADD COLUMN IF NOT EXISTS class_plan_id uuid;

ALTER TABLE public.sessions
  DROP CONSTRAINT IF EXISTS sessions_assignment_type_check;
ALTER TABLE public.sessions
  ADD CONSTRAINT sessions_assignment_type_check
  CHECK (assignment_type IN ('School-wise', 'Class-wise Automatic', 'School-level Override'));

CREATE TABLE IF NOT EXISTS public.class_session_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  academic_year text NOT NULL,
  unit text NOT NULL CHECK (unit IN ('Unit-1','Unit-2','Unit-3','Unit-4')),
  class text NOT NULL,
  session_count integer NOT NULL CHECK (session_count > 0),
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (academic_year, unit, class)
);

CREATE TABLE IF NOT EXISTS public.session_assignment_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  academic_year text NOT NULL,
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  unit text NOT NULL CHECK (unit IN ('Unit-1','Unit-2','Unit-3','Unit-4')),
  class text NOT NULL,
  division text NOT NULL DEFAULT '',
  session_count integer NOT NULL CHECK (session_count > 0),
  assignment_type text NOT NULL CHECK (assignment_type IN ('School-wise', 'Class-wise Automatic', 'School-level Override')),
  class_plan_id uuid REFERENCES public.class_session_plans(id) ON DELETE SET NULL,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (academic_year, school_id, unit, class, division)
);

ALTER TABLE public.sessions
  ADD CONSTRAINT sessions_class_plan_fk
  FOREIGN KEY (class_plan_id) REFERENCES public.class_session_plans(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS sessions_academic_scope_idx
  ON public.sessions (academic_year, school_id, unit, class);
CREATE INDEX IF NOT EXISTS session_assignment_targets_scope_idx
  ON public.session_assignment_targets (academic_year, school_id, unit, class);

GRANT ALL ON public.class_session_plans TO service_role;
GRANT ALL ON public.session_assignment_targets TO service_role;
ALTER TABLE public.class_session_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_assignment_targets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "class_session_plans service role only" ON public.class_session_plans FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "session_assignment_targets service role only" ON public.session_assignment_targets FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE TRIGGER class_session_plans_updated BEFORE UPDATE ON public.class_session_plans FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER session_assignment_targets_updated BEFORE UPDATE ON public.session_assignment_targets FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
