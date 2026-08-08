CREATE TABLE public.sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  unit text NOT NULL DEFAULT 'Unit-1',
  session_name text NOT NULL,
  class text NOT NULL DEFAULT '',
  division text NOT NULL DEFAULT '',
  topic text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sessions_status_check CHECK (status IN ('pending','complete')),
  CONSTRAINT sessions_unit_check CHECK (unit IN ('Unit-1','Unit-2','Unit-3','Unit-4'))
);

CREATE INDEX sessions_scope_idx ON public.sessions (school_id, unit, class, division);

GRANT ALL ON public.sessions TO service_role;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sessions service role only" ON public.sessions FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TRIGGER sessions_updated BEFORE UPDATE ON public.sessions
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();