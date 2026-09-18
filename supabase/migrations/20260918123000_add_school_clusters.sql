-- Add cluster grouping without changing or deleting existing school data.
ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS cluster_name TEXT;

CREATE INDEX IF NOT EXISTS idx_schools_cluster_name ON public.schools(cluster_name);

COMMENT ON COLUMN public.schools.cluster_name IS
  'Administrative cluster used to group schools on the dashboard.';
