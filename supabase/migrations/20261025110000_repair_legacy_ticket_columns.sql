BEGIN;

-- The first ticket implementation used these identity columns. Keep them in
-- the unified schema so old databases and fresh databases accept the same
-- server insert payload.
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS creator_id uuid;
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS creator_name text NOT NULL DEFAULT '';
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS creator_designation text NOT NULL DEFAULT '';
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS username text NOT NULL DEFAULT '';
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS full_name text NOT NULL DEFAULT '';
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT '';

UPDATE public.support_tickets
SET created_by = creator_id
WHERE created_by IS NULL AND creator_id IS NOT NULL;

UPDATE public.support_tickets
SET username = creator_name
WHERE (username IS NULL OR username = '') AND creator_name IS NOT NULL;

UPDATE public.support_tickets
SET full_name = creator_name
WHERE (full_name IS NULL OR full_name = '') AND creator_name IS NOT NULL;

UPDATE public.support_tickets
SET role = creator_designation
WHERE (role IS NULL OR role = '') AND creator_designation IS NOT NULL;

CREATE INDEX IF NOT EXISTS support_tickets_created_by_idx
  ON public.support_tickets(created_by, created_at DESC);

COMMIT;
