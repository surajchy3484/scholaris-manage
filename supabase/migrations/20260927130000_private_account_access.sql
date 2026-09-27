-- Only the application server may access academic/account data. It verifies
-- approved, active app_users and permissions before issuing privileged queries.
-- No records or user accounts are removed.
DO $$
DECLARE tab text; policy_row record;
BEGIN
 FOREACH tab IN ARRAY ARRAY['schools','students','attendance','school_clusters','school_divisions',
 'assessments','questions','clicker_records','assessment_results','exam_scores','sessions',
 'session_division_status','app_users','mcp_allowed_emails','exam_types','question_bank',
 'question_bank_migration_issues','school_drive_sync'] LOOP
  IF to_regclass('public.' || tab) IS NULL THEN CONTINUE; END IF;
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',tab);
  FOR policy_row IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=tab LOOP
   EXECUTE format('DROP POLICY %I ON public.%I',policy_row.policyname,tab);
  END LOOP;
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',tab);
  EXECUTE format('GRANT ALL ON public.%I TO service_role',tab);
  EXECUTE format('CREATE POLICY server_only ON public.%I FOR ALL TO service_role USING(true) WITH CHECK(true)',tab);
 END LOOP;
END $$;
NOTIFY pgrst, 'reload schema';
