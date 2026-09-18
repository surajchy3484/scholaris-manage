-- Security hardening for academic and assessment data.
-- This migration changes permissions and RLS policies only; it does not delete or alter rows.
-- All application access must go through trusted server functions using SUPABASE_SERVICE_ROLE_KEY.

DO $$
DECLARE
  table_name text;
  policy_record record;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['assessments', 'questions', 'clicker_records', 'exam_scores'] LOOP
    -- Remove every existing policy, including policies created with a different name.
    FOR policy_record IN
      SELECT policyname
      FROM pg_policies
      WHERE schemaname = 'public' AND tablename = table_name
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', policy_record.policyname, table_name);
    END LOOP;

    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', table_name);
    EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', table_name);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)',
      table_name || ' service role only', table_name
    );
  END LOOP;
END $$;

-- Ensure sequences used by any future identity columns cannot be accessed publicly.
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;
