-- Rename the app-facing middle-assessment filter from IMF to MCA.
-- Existing legacy IMF score rows remain readable through the MCA aggregation fallback.
DO $$
DECLARE
  definition text;
BEGIN
  SELECT pg_get_functiondef(p.oid)
    INTO definition
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
    AND n.nspname = 'public'
    AND p.proname = 'student_details_page'
    AND p.prokind = 'f'
    AND p.pronargs = 12;

  IF definition IS NULL THEN
    RAISE EXCEPTION 'student_details_page function is missing';
  END IF;

  definition := replace(definition, 'p_exam NOT IN (''ICA'',''IMF'',''FCA'')', 'p_exam NOT IN (''ICA'',''MCA'',''FCA'')');
  definition := replace(definition, 'CASE p_exam WHEN ''IMF'' THEN s.mca', 'CASE p_exam WHEN ''MCA'' THEN s.mca');
  EXECUTE definition;
END $$;

NOTIFY pgrst, 'reload schema';
