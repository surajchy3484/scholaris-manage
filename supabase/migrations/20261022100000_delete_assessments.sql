-- Transactional assessment deletion; shared Question Master is never deleted.
CREATE OR REPLACE FUNCTION public.delete_assessments(p_ids uuid[], p_schools uuid[] DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SET search_path=public AS $$
DECLARE codes text[]; affected jsonb; removed integer;
BEGIN
 IF coalesce(cardinality(p_ids),0) NOT BETWEEN 1 AND 1000 THEN
   RAISE EXCEPTION 'Select between 1 and 1000 assessments';
 END IF;
 -- Evaluation locks this same parent, so new deliveries cannot appear mid-delete.
 PERFORM 1 FROM assessments WHERE id=ANY(p_ids) ORDER BY id FOR UPDATE;
 IF cardinality(p_ids)<>(SELECT count(*) FROM assessments WHERE id=ANY(p_ids)
   AND academic_year=academic_selected_year()) THEN
   RAISE EXCEPTION 'Assessment is not in the selected academic year. Refresh and retry.';
 END IF;
 IF p_schools IS NOT NULL AND EXISTS(SELECT 1 FROM assessments WHERE id=ANY(p_ids)
   AND (school_id IS NULL OR NOT school_id=ANY(p_schools))) THEN
   RAISE EXCEPTION 'School access denied';
 END IF;
 SELECT array_agg(assessment_id) INTO codes FROM assessments WHERE id=ANY(p_ids);
 SELECT coalesce(jsonb_agg(to_jsonb(k)),'[]') INTO affected FROM (
   SELECT DISTINCT c.student_id,upper(btrim(a.exam_type)) exam_type,a.academic_year,
     coalesce(a.subject,'') subject
   FROM assessments a JOIN (
     SELECT assessment_id,student_id FROM clicker_records WHERE assessment_id=ANY(codes)
     UNION SELECT assessment_id,student_id FROM assessment_results WHERE assessment_id=ANY(codes)
   ) c USING(assessment_id) WHERE c.student_id IS NOT NULL
 ) k;
 DELETE FROM assessment_results WHERE assessment_id=ANY(codes)
   OR clicker_id IN (SELECT id FROM clicker_records WHERE assessment_id=ANY(codes));
 DELETE FROM clicker_records WHERE assessment_id=ANY(codes);
 DELETE FROM questions WHERE assessment_id=ANY(codes);
 DELETE FROM question_bank_migration_issues WHERE assessment_id=ANY(codes);
 DELETE FROM assessments WHERE id=ANY(p_ids);
 GET DIAGNOSTICS removed=ROW_COUNT;
 -- Remove only summaries associated with the deleted assessments, then use the
 -- most recent remaining evaluated assessment for each affected report key.
 DELETE FROM exam_scores es USING jsonb_to_recordset(affected)
   AS k(student_id uuid,exam_type text,academic_year text,subject text)
 WHERE es.student_id=k.student_id AND upper(btrim(es.exam_type))=k.exam_type
   AND es.academic_year=k.academic_year AND coalesce(es.subject,'')=k.subject;
 INSERT INTO exam_scores(school_id,student_id,exam_type,academic_year,subject,score)
 SELECT DISTINCT ON(c.student_id,c.exam_type,a.academic_year,coalesce(a.subject,''))
   c.school_id,c.student_id,c.exam_type,a.academic_year,a.subject,c.correct_rate
 FROM clicker_records c JOIN assessments a USING(assessment_id)
 JOIN jsonb_to_recordset(affected) AS k(student_id uuid,exam_type text,academic_year text,subject text)
   ON c.student_id=k.student_id AND upper(btrim(c.exam_type))=k.exam_type
   AND a.academic_year=k.academic_year AND coalesce(a.subject,'')=k.subject
 WHERE c.evaluated_at IS NOT NULL
 ORDER BY c.student_id,c.exam_type,a.academic_year,coalesce(a.subject,''),
   a.date DESC NULLS LAST,c.evaluated_at DESC,c.id DESC
 ON CONFLICT(student_id,exam_type,academic_year,(coalesce(subject,'')))
 DO UPDATE SET score=excluded.score,school_id=excluded.school_id;
 RETURN removed;
END $$;
REVOKE ALL ON FUNCTION public.delete_assessments(uuid[],uuid[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.delete_assessments(uuid[],uuid[]) TO service_role;
NOTIFY pgrst, 'reload schema';
