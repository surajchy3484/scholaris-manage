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

CREATE INDEX IF NOT EXISTS support_ticket_replies_ticket_idx ON public.support_ticket_replies(ticket_id, created_at);
CREATE INDEX IF NOT EXISTS support_ticket_activity_ticket_idx ON public.support_ticket_activity(ticket_id, created_at);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['support_ticket_replies','support_ticket_activity','support_ticket_attachments'] LOOP
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || ' service role only', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)', t || ' service role only', t);
  END LOOP;
END $$;