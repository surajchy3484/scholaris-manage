-- Set the requested current academic year after the academic_years table exists.
UPDATE public.academic_years
SET is_current = (id = '2026-27');
