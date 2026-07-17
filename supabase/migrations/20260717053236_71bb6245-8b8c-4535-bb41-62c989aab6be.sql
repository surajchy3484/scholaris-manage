
-- Sequence + column for school code
CREATE SEQUENCE IF NOT EXISTS public.schools_code_seq START 1;

ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS code TEXT;

-- Backfill existing schools in creation order
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id FROM public.schools WHERE code IS NULL ORDER BY created_at ASC LOOP
    UPDATE public.schools
      SET code = 'SCH' || LPAD(nextval('public.schools_code_seq')::text, 3, '0')
      WHERE id = r.id;
  END LOOP;
END $$;

-- Enforce uniqueness + auto-assign on insert
CREATE UNIQUE INDEX IF NOT EXISTS schools_code_key ON public.schools(code);

CREATE OR REPLACE FUNCTION public.tg_assign_school_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.code IS NULL OR NEW.code = '' THEN
    NEW.code := 'SCH' || LPAD(nextval('public.schools_code_seq')::text, 3, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS assign_school_code ON public.schools;
CREATE TRIGGER assign_school_code
  BEFORE INSERT ON public.schools
  FOR EACH ROW EXECUTE FUNCTION public.tg_assign_school_code();

ALTER TABLE public.schools ALTER COLUMN code SET NOT NULL;
