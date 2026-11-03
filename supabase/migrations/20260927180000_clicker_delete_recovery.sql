-- Standalone deletion repair: does not require the universal question bank.
-- Installs a function only; no existing records are changed by this migration.
CREATE OR REPLACE FUNCTION public.delete_clicker_records(p_ids uuid[], p_schools uuid[] DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SET search_path=public AS $$
DECLARE removed jsonb; affected text[]; n integer;
BEGIN
 IF coalesce(cardinality(p_ids),0) NOT BETWEEN 1 AND 500 THEN
  RAISE EXCEPTION 'Select between 1 and 500 Clicker records';
 END IF;
 LOCK TABLE public.clicker_records IN SHARE ROW EXCLUSIVE MODE;
 IF cardinality(p_ids)<>(SELECT count(*) FROM public.clicker_records WHERE id=ANY(p_ids)) THEN
  RAISE EXCEPTION 'A Clicker record no longer exists. Refresh and retry.';
 END IF;
 IF p_schools IS NOT NULL AND EXISTS(
  SELECT 1 FROM public.clicker_records WHERE id=ANY(p_ids)
  AND (school_id IS NULL OR NOT school_id=ANY(p_schools))
 ) THEN RAISE EXCEPTION 'School access denied'; END IF;
 SELECT array_agg(DISTINCT assessment_id) INTO affected FROM public.clicker_records WHERE id=ANY(p_ids);
 WITH deleted AS (DELETE FROM public.clicker_records WHERE id=ANY(p_ids) RETURNING *)
 SELECT jsonb_agg(to_jsonb(deleted)) INTO removed FROM deleted;
 n:=jsonb_array_length(removed);
 IF to_regclass('public.assessment_results') IS NOT NULL THEN
  -- to_jsonb supports both legacy schemas and schemas with clicker_id.
  DELETE FROM public.assessment_results r WHERE EXISTS(
   SELECT 1 FROM jsonb_array_elements(removed) c WHERE
    to_jsonb(r)->>'clicker_id'=c->>'id' OR
    (to_jsonb(r)->>'clicker_id' IS NULL AND
     r.assessment_id=c->>'assessment_id' AND r.keypad_id=c->>'keypad_id')
  );
 END IF;
 -- An assessment identifies its exam type; this works before exam_type exists
 -- on Clicker rows. Only groups touched by this deletion are recalculated.
 WITH ranks AS (
  SELECT id,rank() OVER(PARTITION BY school_id,assessment_id,class,section ORDER BY score DESC NULLS LAST) r
  FROM public.clicker_records WHERE assessment_id=ANY(affected)
 ) UPDATE public.clicker_records c SET ranking=r.r FROM ranks r WHERE c.id=r.id;
 IF to_regclass('public.assessment_results') IS NOT NULL THEN
  UPDATE public.assessment_results r SET ranking=c.ranking
  FROM public.clicker_records c WHERE c.assessment_id=ANY(affected) AND
   (to_jsonb(r)->>'clicker_id'=c.id::text OR
    (to_jsonb(r)->>'clicker_id' IS NULL AND r.assessment_id=c.assessment_id AND r.keypad_id=c.keypad_id));
 END IF;
 -- Do not remove historical manually maintained exam_scores summaries.
 RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.delete_clicker_records(uuid[],uuid[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.delete_clicker_records(uuid[],uuid[]) TO service_role;
NOTIFY pgrst, 'reload schema';
