-- Standalone cluster directory used by the dashboard Add Cluster action.
CREATE TABLE IF NOT EXISTS public.school_clusters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS school_clusters_name_lower_key
  ON public.school_clusters (lower(name));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.school_clusters TO anon, authenticated;
GRANT ALL ON public.school_clusters TO service_role;

ALTER TABLE public.school_clusters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public school clusters all" ON public.school_clusters;
CREATE POLICY "public school clusters all"
  ON public.school_clusters FOR ALL USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS school_clusters_updated ON public.school_clusters;
CREATE TRIGGER school_clusters_updated
  BEFORE UPDATE ON public.school_clusters
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Backfill clusters already assigned to schools without creating duplicates.
INSERT INTO public.school_clusters (name)
SELECT DISTINCT trim(cluster_name)
FROM public.schools
WHERE cluster_name IS NOT NULL AND trim(cluster_name) <> ''
  AND NOT EXISTS (
    SELECT 1
    FROM public.school_clusters existing
    WHERE lower(existing.name) = lower(trim(public.schools.cluster_name))
  );
