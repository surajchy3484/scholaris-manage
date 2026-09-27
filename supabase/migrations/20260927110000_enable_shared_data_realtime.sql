-- Broadcast row changes so open user sessions can refresh shared data immediately.
DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'app_users',
    'assessments',
    'attendance',
    'clicker_records',
    'exam_scores',
    'questions',
    'school_clusters',
    'school_divisions',
    'schools',
    'session_division_status',
    'sessions',
    'students'
  ] LOOP
    IF to_regclass('public.' || table_name) IS NOT NULL THEN
      BEGIN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', table_name);
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END;
    END IF;
  END LOOP;
END $$;
