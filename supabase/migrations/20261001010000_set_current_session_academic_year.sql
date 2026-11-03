-- Keep the existing session academic-year convention used by this deployment.
ALTER TABLE public.sessions
  ALTER COLUMN academic_year SET DEFAULT '2026';
