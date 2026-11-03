-- A confirmed student deletion removes that identity and linked database records
-- across academic years. Ordinary direct deletes remain guarded.
BEGIN;
CREATE OR REPLACE FUNCTION public.academic_preserve_student()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF pg_has_role(current_user,'service_role','USAGE')
    AND OLD.id=ANY(coalesce(nullif(current_setting('app.student_delete_ids',true),''),'{}')::uuid[]) THEN
   RETURN OLD;
 END IF;
 RAISE EXCEPTION 'Use the authorized student deletion action to remove a student and linked records.';
END $$;
CREATE OR REPLACE FUNCTION public.delete_students_permanently(p_school uuid,p_ids uuid[],p_schools uuid[] DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SET search_path=public AS $$
DECLARE n integer; affected text[]; previous_ids text;
BEGIN
 IF coalesce(cardinality(p_ids),0) NOT BETWEEN 1 AND 250 THEN
   RAISE EXCEPTION 'Select between 1 and 250 students';
 END IF;
 PERFORM 1 FROM students WHERE id=ANY(p_ids) ORDER BY id FOR UPDATE;
 IF cardinality(p_ids)<>(SELECT count(*) FROM student_enrollments
   WHERE student_id=ANY(p_ids) AND school_id=p_school AND academic_year=academic_selected_year()) THEN
   RAISE EXCEPTION 'A student is not in the selected school and academic year. Refresh and retry.';
 END IF;
 -- A transferred student can have history in other schools. Restricted users
 -- need access to every affected school; an administrator can delete across all.
 IF p_schools IS NOT NULL AND (NOT p_school=ANY(p_schools) OR EXISTS(
   SELECT 1 FROM (
     SELECT school_id FROM student_enrollments WHERE student_id=ANY(p_ids)
     UNION SELECT school_id FROM students WHERE id=ANY(p_ids)
     UNION SELECT school_id FROM attendance WHERE student_id=ANY(p_ids)
     UNION SELECT school_id FROM clicker_records WHERE student_id=ANY(p_ids)
     UNION SELECT school_id FROM assessment_results WHERE student_id=ANY(p_ids)
     UNION SELECT school_id FROM exam_scores WHERE student_id=ANY(p_ids)
   ) related WHERE school_id IS NULL OR NOT school_id=ANY(p_schools)
 )) THEN RAISE EXCEPTION 'School access denied: an administrator must delete students with history outside your assigned schools.'; END IF;
 SELECT array_agg(DISTINCT assessment_id) INTO affected FROM clicker_records WHERE student_id=ANY(p_ids);
 DELETE FROM assessment_results WHERE student_id=ANY(p_ids)
   OR clicker_id IN (SELECT id FROM clicker_records WHERE student_id=ANY(p_ids));
 DELETE FROM clicker_records WHERE student_id=ANY(p_ids);
 DELETE FROM exam_scores WHERE student_id=ANY(p_ids);
 DELETE FROM attendance WHERE student_id=ANY(p_ids);
 DELETE FROM student_enrollments WHERE student_id=ANY(p_ids);
 previous_ids := current_setting('app.student_delete_ids',true);
 PERFORM set_config('app.student_delete_ids',p_ids::text,true);
 DELETE FROM students WHERE id=ANY(p_ids);
 GET DIAGNOSTICS n=ROW_COUNT;
 PERFORM set_config('app.student_delete_ids',coalesce(previous_ids,''),true);
 WITH ranks AS (
   SELECT id,rank() OVER(PARTITION BY academic_year,school_id,assessment_id,exam_type,class,section ORDER BY score DESC) r
   FROM clicker_records WHERE assessment_id=ANY(affected) AND evaluated_at IS NOT NULL
 ) UPDATE clicker_records c SET ranking=r.r FROM ranks r WHERE c.id=r.id;
 UPDATE assessment_results r SET ranking=c.ranking FROM clicker_records c
 WHERE c.assessment_id=ANY(affected) AND
   (r.clicker_id=c.id OR (r.clicker_id IS NULL AND r.assessment_id=c.assessment_id AND r.keypad_id=c.keypad_id));
 RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.delete_students_permanently(uuid,uuid[],uuid[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.delete_students_permanently(uuid,uuid[],uuid[]) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
