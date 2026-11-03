-- Bound import work to changed results; retain original evaluation and access rules.
BEGIN;
CREATE INDEX IF NOT EXISTS clicker_student_lookup_idx ON public.clicker_records(student_id);
CREATE INDEX IF NOT EXISTS clicker_assessment_student_idx ON public.clicker_records(assessment_id,student_id);
CREATE INDEX IF NOT EXISTS assessment_results_clicker_lookup_idx ON public.assessment_results(clicker_id);
DO $$
DECLARE definition text;
BEGIN
 SELECT pg_get_functiondef('public.universal_clicker_write(text,jsonb,uuid[],jsonb,uuid[])'::regprocedure) INTO definition;
 IF position('-- bounded result synchronization' in definition)=0 THEN
   IF position('WHERE c.id=r.id;' in definition)=0 OR position('WHERE assessment_id=ANY(aids) AND evaluated_at IS NOT NULL'||chr(10)||'  ON CONFLICT' in definition)=0 THEN
     RAISE EXCEPTION 'Unexpected Clicker writer version; review before applying performance patch';
   END IF;
   definition := replace(definition,'WHERE c.id=r.id;', 'WHERE c.id=r.id AND c.ranking IS DISTINCT FROM r.r;');
   definition := replace(definition,
     'WHERE assessment_id=ANY(aids) AND evaluated_at IS NOT NULL'||chr(10)||'  ON CONFLICT',
     'WHERE id=ANY(ids) AND evaluated_at IS NOT NULL'||chr(10)||'  ON CONFLICT');
   definition := replace(definition,'  RETURN n;',
     '-- bounded result synchronization: existing students only need their new rank.'||chr(10)||
     '  UPDATE assessment_results result SET ranking=c.ranking FROM clicker_records c'||chr(10)||
     '  WHERE c.assessment_id=ANY(aids) AND result.clicker_id=c.id'||chr(10)||
     '    AND result.ranking IS DISTINCT FROM c.ranking;'||chr(10)||'  RETURN n;');
   EXECUTE definition;
 END IF;
END $$;
NOTIFY pgrst, 'reload schema';
COMMIT;
