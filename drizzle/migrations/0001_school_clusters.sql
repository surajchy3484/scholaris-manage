ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS cluster_name TEXT;
CREATE TABLE IF NOT EXISTS public.school_clusters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS school_clusters_name_lower_key ON public.school_clusters (lower(name));
GRANT ALL ON public.school_clusters TO service_role;
ALTER TABLE public.school_clusters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "school_clusters service role only" ON public.school_clusters FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE TRIGGER school_clusters_updated BEFORE UPDATE ON public.school_clusters FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();