-- Khadavali ICA scores must come only from evaluated Clicker Master rows.
-- Remove legacy/manual ICA rows for this school when there is no matching
-- evaluated Clicker record. Student identities and all other exam scores stay
-- untouched; a future Clicker upload will recreate the ICA score automatically.
DELETE FROM public.exam_scores es
USING public.schools s
WHERE s.id=es.school_id
  AND regexp_replace(lower(btrim(s.name)), '[^a-z0-9]+', '', 'g')
      = regexp_replace(
          lower('Anudanit Adivasi Prathmik V Madhaymik Asharmshala Khadavali'),
          '[^a-z0-9]+',
          '',
          'g'
        )
  AND upper(btrim(es.exam_type))='ICA'
  AND NOT EXISTS (
    SELECT 1
    FROM public.clicker_records c
    JOIN public.assessments a ON a.assessment_id=c.assessment_id
    WHERE c.student_id=es.student_id
      AND c.school_id=es.school_id
      AND upper(btrim(c.exam_type))='ICA'
      AND c.evaluated_at IS NOT NULL
      AND c.academic_year=es.academic_year
      AND a.academic_year=es.academic_year
  );

-- Also prevent any legacy ICA row from appearing in the Student Report before
-- the cleanup migration has been applied to an existing deployment. The rule
-- is intentionally limited to ICA; MCA/FCA/manual score workflows are unchanged.
DO $$
DECLARE
  fn text;
BEGIN
  SELECT pg_get_functiondef(p.oid)
    INTO fn
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public'
    AND p.proname='student_details_page'
  LIMIT 1;

  IF fn IS NOT NULL THEN
    fn := replace(
      fn,
      'WHERE e.school_id=p_school AND e.exam_type IN (''ICA'',''MCA'',''IMF'',''FCA'',''ATTENDANCE'')',
      'WHERE e.school_id=p_school AND e.exam_type IN (''ICA'',''MCA'',''IMF'',''FCA'',''ATTENDANCE'') AND (e.exam_type<>''ICA'' OR EXISTS (SELECT 1 FROM public.clicker_records c JOIN public.assessments a ON a.assessment_id=c.assessment_id WHERE c.student_id=e.student_id AND c.school_id=e.school_id AND upper(btrim(c.exam_type))=''ICA'' AND c.evaluated_at IS NOT NULL AND c.academic_year=e.academic_year AND a.academic_year=e.academic_year))'
    );
    EXECUTE fn;
  END IF;
END $$;
