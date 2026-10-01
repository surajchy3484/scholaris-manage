-- Preserve the existing deployment convention: uploaded records use academic year 2026.
INSERT INTO public.academic_years(id, name, is_current)
VALUES ('2026', '2026', false)
ON CONFLICT (id) DO NOTHING;

UPDATE public.academic_years
SET is_current = false
WHERE is_current;

UPDATE public.academic_years
SET is_current = true
WHERE id = '2026';
