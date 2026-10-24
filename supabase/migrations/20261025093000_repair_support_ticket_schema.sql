BEGIN;

-- A previous partial setup may have created support_tickets already.  CREATE TABLE
-- IF NOT EXISTS does not modify an existing table, so repair every required field
-- explicitly before the application queries creator_id and workflow data.
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS ticket_number bigint;
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS ticket_id text;
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS academic_year text NOT NULL DEFAULT '2026';
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS subject text NOT NULL DEFAULT 'Untitled ticket';
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'Other';
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'Medium';
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '';
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS creator_id uuid;
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS creator_name text NOT NULL DEFAULT '';
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS creator_designation text NOT NULL DEFAULT '';
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS school_id uuid;
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS class text;
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS division text;
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS assigned_to uuid;
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'Open';
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS resolution_details text;
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS resolved_at timestamptz;
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS closed_at timestamptz;

-- Backfill a safe sequence-like number and IDs for rows from a partial setup.
CREATE SEQUENCE IF NOT EXISTS public.support_ticket_number_seq;
UPDATE public.support_tickets
SET ticket_number = nextval('public.support_ticket_number_seq')
WHERE ticket_number IS NULL;
UPDATE public.support_tickets
SET ticket_id = 'TKT-' || regexp_replace(academic_year, '[^0-9]', '', 'g') || '-' || lpad(ticket_number::text, 4, '0')
WHERE ticket_id IS NULL OR ticket_id = '';

CREATE UNIQUE INDEX IF NOT EXISTS support_tickets_ticket_id_key ON public.support_tickets(ticket_id);
CREATE INDEX IF NOT EXISTS support_tickets_creator_idx ON public.support_tickets(creator_id, created_at DESC);

-- Add the creator foreign key only when it is not already present. Existing
-- partial rows with a null creator remain visible to administrators for repair.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.support_tickets'::regclass
      AND conname = 'support_tickets_creator_id_fkey'
  ) THEN
    ALTER TABLE public.support_tickets
      ADD CONSTRAINT support_tickets_creator_id_fkey
      FOREIGN KEY (creator_id) REFERENCES public.app_users(id) ON DELETE RESTRICT;
  END IF;
END $$;

COMMIT;
