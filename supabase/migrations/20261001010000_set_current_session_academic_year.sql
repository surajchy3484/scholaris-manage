-- Make 2026-27 the current academic year for session data.
ALTER TABLE public.sessions
  ALTER COLUMN academic_year SET DEFAULT '2026-27';

UPDATE public.sessions
SET academic_year = '2026-27'
WHERE academic_year IS NULL OR academic_year = '2026';
