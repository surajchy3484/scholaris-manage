-- 1. Per-division status table
CREATE TABLE public.session_division_status (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  unit text NOT NULL,
  class text NOT NULL DEFAULT '',
  division text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  updated_by text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (session_id, division)
);

GRANT ALL ON public.session_division_status TO service_role;

ALTER TABLE public.session_division_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "session_division_status service role only"
  ON public.session_division_status FOR ALL
  TO service_role USING (true) WITH CHECK (true);

CREATE TRIGGER session_division_status_updated
  BEFORE UPDATE ON public.session_division_status
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- 2. Choose one master session row per (school, unit, class, name)
CREATE TEMP TABLE keeper AS
SELECT DISTINCT ON (school_id, unit, class, lower(btrim(session_name)))
       id, school_id, unit, class, lower(btrim(session_name)) AS key
FROM public.sessions
ORDER BY school_id, unit, class, lower(btrim(session_name)), created_at, id;

-- 3. Preserve existing per-division statuses against the keeper session
INSERT INTO public.session_division_status (session_id, school_id, unit, class, division, status)
SELECT k.id, s.school_id, s.unit, s.class,
       upper(btrim(s.division)),
       s.status
FROM public.sessions s
JOIN keeper k
  ON k.school_id = s.school_id
 AND k.unit = s.unit
 AND k.class = s.class
 AND k.key = lower(btrim(s.session_name))
WHERE btrim(coalesce(s.division, '')) <> ''
ON CONFLICT (session_id, division) DO NOTHING;

-- 4. Remove duplicate master rows created per division
DELETE FROM public.sessions s
WHERE NOT EXISTS (SELECT 1 FROM keeper k WHERE k.id = s.id);

-- 5. Division no longer belongs on the session master
ALTER TABLE public.sessions DROP COLUMN division;

-- 6. Indexes
CREATE INDEX IF NOT EXISTS sessions_school_unit_class_idx
  ON public.sessions (school_id, unit, class);
CREATE INDEX IF NOT EXISTS sds_school_unit_class_division_idx
  ON public.session_division_status (school_id, unit, class, division);
CREATE INDEX IF NOT EXISTS sds_session_idx
  ON public.session_division_status (session_id);