BEGIN;

-- Repair installations where the broadcast message table was created but the
-- recipient table or its delivery indexes were only partially applied.
CREATE TABLE IF NOT EXISTS public.broadcast_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  broadcast_id uuid NOT NULL REFERENCES public.broadcast_messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS broadcast_recipients_broadcast_user_key
  ON public.broadcast_recipients(broadcast_id, user_id);
CREATE INDEX IF NOT EXISTS broadcast_recipients_user_read_idx
  ON public.broadcast_recipients(user_id, read_at, created_at DESC);

ALTER TABLE public.broadcast_recipients ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.broadcast_recipients FROM anon, authenticated;
GRANT ALL ON TABLE public.broadcast_recipients TO service_role;
DROP POLICY IF EXISTS "broadcast recipients service role only" ON public.broadcast_recipients;
CREATE POLICY "broadcast recipients service role only"
  ON public.broadcast_recipients FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = 'broadcast_recipients'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.broadcast_recipients;
  END IF;
END $$;

COMMIT;
