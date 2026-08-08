CREATE TABLE public.mcp_allowed_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.mcp_allowed_emails TO service_role;
ALTER TABLE public.mcp_allowed_emails ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role manages MCP allow list" ON public.mcp_allowed_emails FOR ALL TO service_role USING (true) WITH CHECK (true);