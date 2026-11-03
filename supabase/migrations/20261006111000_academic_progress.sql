-- Read-only multi-year comparison. School restrictions apply to every source.
CREATE OR REPLACE FUNCTION public.academic_progress_page(
 p_search text DEFAULT '',p_school uuid DEFAULT NULL,p_page integer DEFAULT 0,p_size integer DEFAULT 50,p_schools uuid[] DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path=public AS $$
DECLARE result jsonb;
BEGIN
 IF p_page<0 OR p_size NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Invalid progress page'; END IF;
 IF p_school IS NOT NULL AND p_schools IS NOT NULL AND NOT p_school=ANY(p_schools) THEN RAISE EXCEPTION 'School access denied'; END IF;
 WITH permitted AS (
   SELECT e.* FROM student_enrollments e JOIN academic_years y ON y.id=e.academic_year AND NOT y.is_archived
   WHERE (p_school IS NULL OR e.school_id=p_school) AND (p_schools IS NULL OR e.school_id=ANY(p_schools))
 ), roster AS (
   SELECT s.id,s.student_code,s.name FROM students s
   WHERE EXISTS(SELECT 1 FROM permitted e WHERE e.student_id=s.id)
   AND (p_search='' OR strpos(lower(s.name),lower(p_search))>0 OR strpos(lower(coalesce(s.student_code,'')),lower(p_search))>0)
 ), page AS (
   SELECT * FROM roster ORDER BY name,id LIMIT p_size OFFSET p_page*p_size
 ), clicker AS (
   SELECT r.student_id,r.academic_year,CASE WHEN upper(r.exam_type)='IMF' THEN 'MCA' ELSE upper(r.exam_type) END AS exam_type,
     avg(r.correct_rate) AS percentage,count(*) AS assessments
   FROM assessment_results r JOIN page s ON s.id=r.student_id
   JOIN academic_years y ON y.id=r.academic_year AND NOT y.is_archived
   WHERE (p_school IS NULL OR r.school_id=p_school) AND (p_schools IS NULL OR r.school_id=ANY(p_schools))
   GROUP BY r.student_id,r.academic_year,CASE WHEN upper(r.exam_type)='IMF' THEN 'MCA' ELSE upper(r.exam_type) END
 ), manual AS (
   SELECT r.student_id,r.academic_year,CASE WHEN upper(r.exam_type)='IMF' THEN 'MCA' ELSE upper(r.exam_type) END AS exam_type,
     avg(r.score) AS percentage,0::bigint AS assessments
   FROM exam_scores r JOIN page s ON s.id=r.student_id
   JOIN academic_years y ON y.id=r.academic_year AND NOT y.is_archived
   WHERE (p_school IS NULL OR r.school_id=p_school) AND (p_schools IS NULL OR r.school_id=ANY(p_schools))
   GROUP BY r.student_id,r.academic_year,CASE WHEN upper(r.exam_type)='IMF' THEN 'MCA' ELSE upper(r.exam_type) END
 ), scores AS (
   SELECT * FROM clicker
   UNION ALL SELECT m.* FROM manual m WHERE NOT EXISTS(
     SELECT 1 FROM clicker c WHERE (c.student_id,c.academic_year,c.exam_type)=(m.student_id,m.academic_year,m.exam_type)
   )
 ) SELECT jsonb_build_object(
   'total',(SELECT count(*) FROM roster),
   'years',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'is_current',is_current) ORDER BY id),'[]') FROM academic_years WHERE NOT is_archived),
   'rows',(SELECT coalesce(jsonb_agg(to_jsonb(s)||jsonb_build_object('scores',(
     SELECT coalesce(jsonb_agg(to_jsonb(r)-'student_id' ORDER BY r.academic_year,r.exam_type),'[]') FROM scores r WHERE r.student_id=s.id
   )) ORDER BY s.name,s.id),'[]') FROM page s)
 ) INTO result;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.academic_progress_page(text,uuid,integer,integer,uuid[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.academic_progress_page(text,uuid,integer,integer,uuid[]) TO service_role;
NOTIFY pgrst,'reload schema';
