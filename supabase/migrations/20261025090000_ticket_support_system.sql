BEGIN;

CREATE TABLE IF NOT EXISTS public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  ticket_id text NOT NULL UNIQUE,
  academic_year text NOT NULL DEFAULT '2026',
  subject text NOT NULL CHECK (char_length(subject) BETWEEN 3 AND 240),
  category text NOT NULL CHECK (category IN ('Student Data','Attendance','Session Status','Assessment/Exam','Dashboard/Reports','User Access/Login','Technical Issue','Data Import/Export','Feature Request','Other')),
  priority text NOT NULL DEFAULT 'Medium' CHECK (priority IN ('Low','Medium','High','Critical')),
  description text NOT NULL CHECK (char_length(description) BETWEEN 10 AND 20000),
  creator_id uuid NOT NULL REFERENCES public.app_users(id) ON DELETE RESTRICT,
  creator_name text NOT NULL DEFAULT '',
  creator_designation text NOT NULL DEFAULT '',
  school_id uuid REFERENCES public.schools(id) ON DELETE SET NULL,
  class text,
  division text,
  assigned_to uuid REFERENCES public.app_users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'Open' CHECK (status IN ('Open','Under Review','In Progress','Pending User Response','Resolved','Closed','Reopened')),
  resolution_details text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  closed_at timestamptz
);

CREATE OR REPLACE FUNCTION public.set_support_ticket_id()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.ticket_id IS NULL OR NEW.ticket_id = '' THEN
    NEW.ticket_id := 'TKT-' || regexp_replace(NEW.academic_year, '[^0-9]', '', 'g') || '-' || lpad(NEW.ticket_number::text, 4, '0');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS support_ticket_id ON public.support_tickets;
CREATE TRIGGER support_ticket_id BEFORE INSERT ON public.support_tickets
FOR EACH ROW EXECUTE FUNCTION public.set_support_ticket_id();

DROP TRIGGER IF EXISTS support_tickets_updated ON public.support_tickets;
CREATE TRIGGER support_tickets_updated BEFORE UPDATE ON public.support_tickets
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE IF NOT EXISTS public.support_ticket_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES public.app_users(id) ON DELETE RESTRICT,
  sender_name text NOT NULL DEFAULT '',
  message text NOT NULL CHECK (char_length(message) BETWEEN 1 AND 20000),
  visibility text NOT NULL DEFAULT 'public' CHECK (visibility IN ('public','internal')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.support_ticket_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES public.app_users(id) ON DELETE RESTRICT,
  actor_name text NOT NULL DEFAULT '',
  action text NOT NULL,
  previous_value text,
  new_value text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.support_ticket_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  reply_id uuid REFERENCES public.support_ticket_replies(id) ON DELETE CASCADE,
  uploaded_by uuid NOT NULL REFERENCES public.app_users(id) ON DELETE RESTRICT,
  filename text NOT NULL,
  content_type text NOT NULL,
  size_bytes bigint NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 10485760),
  storage_path text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.support_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
  ticket_id uuid REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  type text NOT NULL,
  message text NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS support_tickets_creator_idx ON public.support_tickets(creator_id, created_at DESC);
CREATE INDEX IF NOT EXISTS support_tickets_scope_idx ON public.support_tickets(school_id, status, priority, created_at DESC);
CREATE INDEX IF NOT EXISTS support_tickets_search_idx ON public.support_tickets(ticket_id, subject);
CREATE INDEX IF NOT EXISTS support_ticket_replies_ticket_idx ON public.support_ticket_replies(ticket_id, created_at);
CREATE INDEX IF NOT EXISTS support_ticket_activity_ticket_idx ON public.support_ticket_activity(ticket_id, created_at);
CREATE INDEX IF NOT EXISTS support_notifications_user_idx ON public.support_notifications(user_id, read_at, created_at DESC);

INSERT INTO storage.buckets (id, name, public)
VALUES ('ticket-attachments', 'ticket-attachments', false)
ON CONFLICT (id) DO NOTHING;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['support_tickets','support_ticket_replies','support_ticket_activity','support_ticket_attachments','support_notifications'] LOOP
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || ' service role only', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)', t || ' service role only', t);
  END LOOP;
END $$;

COMMIT;
