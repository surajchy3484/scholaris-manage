BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS support_notifications_recipient_ticket_type_key
  ON public.support_notifications(user_id, ticket_id, type)
  WHERE ticket_id IS NOT NULL;

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
