BEGIN;

-- Repair databases where the ticket table exists but the notification table was
-- skipped or the original support migration was only partially applied.
CREATE TABLE IF NOT EXISTS public.support_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
  ticket_id uuid REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'new_ticket',
  message text NOT NULL DEFAULT '',
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS support_notifications_user_idx
  ON public.support_notifications(user_id, read_at, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS support_notifications_recipient_ticket_type_key
  ON public.support_notifications(user_id, ticket_id, type)
  WHERE ticket_id IS NOT NULL;

REVOKE ALL ON TABLE public.support_notifications FROM anon, authenticated;
GRANT ALL ON TABLE public.support_notifications TO service_role;
ALTER TABLE public.support_notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "support_notifications service role only" ON public.support_notifications;
CREATE POLICY "support_notifications service role only"
  ON public.support_notifications
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1
       FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = 'support_notifications'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.support_notifications;
  END IF;
END $$;

COMMIT;
