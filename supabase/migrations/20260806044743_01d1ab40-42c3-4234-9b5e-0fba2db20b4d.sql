DROP POLICY IF EXISTS "public assessments all" ON public.assessments;
DROP POLICY IF EXISTS "public questions all" ON public.questions;
DROP POLICY IF EXISTS "public clicker_records all" ON public.clicker_records;

REVOKE ALL ON public.assessments FROM anon, authenticated;
REVOKE ALL ON public.questions FROM anon, authenticated;
REVOKE ALL ON public.clicker_records FROM anon, authenticated;

GRANT ALL ON public.assessments TO service_role;
GRANT ALL ON public.questions TO service_role;
GRANT ALL ON public.clicker_records TO service_role;

ALTER TABLE public.assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clicker_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "assessments service role only" ON public.assessments FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "questions service role only" ON public.questions FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "clicker_records service role only" ON public.clicker_records FOR ALL TO service_role USING (true) WITH CHECK (true);