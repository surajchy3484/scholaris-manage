DROP POLICY IF EXISTS "public exam_scores all" ON public.exam_scores;
REVOKE ALL ON public.exam_scores FROM anon;
REVOKE ALL ON public.exam_scores FROM authenticated;
GRANT ALL ON public.exam_scores TO service_role;
ALTER TABLE public.exam_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_scores FORCE ROW LEVEL SECURITY;
CREATE POLICY "exam_scores service role only" ON public.exam_scores FOR ALL TO service_role USING (true) WITH CHECK (true);