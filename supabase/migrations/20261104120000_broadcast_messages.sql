BEGIN;

CREATE TABLE IF NOT EXISTS public.broadcast_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid REFERENCES public.app_users(id) ON DELETE SET NULL,
  sender_name text NOT NULL DEFAULT 'Administrator',
  title text NOT NULL CHECK (char_length(title) BETWEEN 3 AND 200),
  description text NOT NULL CHECK (char_length(description) BETWEEN 1 AND 20000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.broadcast_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  broadcast_id uuid NOT NULL REFERENCES public.broadcast_messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT broadcast_recipients_broadcast_user_key UNIQUE (broadcast_id, user_id)
);

CREATE INDEX IF NOT EXISTS broadcast_messages_created_at_idx
  ON public.broadcast_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS broadcast_recipients_user_read_idx
  ON public.broadcast_recipients(user_id, read_at, created_at DESC);

ALTER TABLE public.broadcast_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.broadcast_recipients ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.broadcast_messages, public.broadcast_recipients FROM anon, authenticated;
GRANT ALL ON TABLE public.broadcast_messages, public.broadcast_recipients TO service_role;

DROP POLICY IF EXISTS "broadcast messages service role only" ON public.broadcast_messages;
CREATE POLICY "broadcast messages service role only"
  ON public.broadcast_messages FOR ALL TO service_role
  USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "broadcast recipients service role only" ON public.broadcast_recipients;
CREATE POLICY "broadcast recipients service role only"
  ON public.broadcast_recipients FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'broadcast_recipients'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.broadcast_recipients;
    END IF;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.broadcast_message_refresh()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM realtime.broadcast(
    'schoolrise-support-notifications',
    'new',
    jsonb_build_object('broadcast_id', NEW.broadcast_id),
    false
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS broadcast_message_refresh ON public.broadcast_recipients;
CREATE TRIGGER broadcast_message_refresh
  AFTER INSERT ON public.broadcast_recipients
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_message_refresh();

REVOKE ALL ON FUNCTION public.broadcast_message_refresh() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.broadcast_message_refresh() TO service_role;

COMMIT;
