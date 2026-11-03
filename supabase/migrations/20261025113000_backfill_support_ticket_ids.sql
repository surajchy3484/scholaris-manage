BEGIN;

-- Repair older ticket rows that were created before the ticket-ID trigger or
-- that used the legacy support_tickets schema.
CREATE SEQUENCE IF NOT EXISTS public.support_ticket_number_seq;
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS ticket_number bigint;
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS ticket_id text;

UPDATE public.support_tickets
SET ticket_number = nextval('public.support_ticket_number_seq')
WHERE ticket_number IS NULL;

UPDATE public.support_tickets
SET ticket_id = 'TKT-' || regexp_replace(COALESCE(academic_year, '2026'), '[^0-9]', '', 'g') || '-' || lpad(ticket_number::text, 4, '0')
WHERE (ticket_id IS NULL OR ticket_id = '') AND ticket_number IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS support_tickets_ticket_id_key
  ON public.support_tickets(ticket_id)
  WHERE ticket_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.set_support_ticket_id()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.ticket_number IS NULL THEN
    NEW.ticket_number := nextval('public.support_ticket_number_seq');
  END IF;
  IF NEW.ticket_id IS NULL OR NEW.ticket_id = '' THEN
    NEW.ticket_id := 'TKT-' || regexp_replace(COALESCE(NEW.academic_year, '2026'), '[^0-9]', '', 'g') || '-' || lpad(NEW.ticket_number::text, 4, '0');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS support_ticket_id ON public.support_tickets;
CREATE TRIGGER support_ticket_id
  BEFORE INSERT ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.set_support_ticket_id();

COMMIT;
