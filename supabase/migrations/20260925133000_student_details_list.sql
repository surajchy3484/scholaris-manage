-- Additive only: no existing student or assessment rows are modified.
CREATE INDEX IF NOT EXISTS student_details_score_latest ON public.exam_scores(student_id,exam_type,updated_at DESC,id);
CREATE OR REPLACE FUNCTION public.student_details_page(
 p_school uuid,p_class text DEFAULT 'all',p_division text DEFAULT 'all',p_search text DEFAULT '',
 p_page integer DEFAULT 0,p_size integer DEFAULT 50,p_sort text DEFAULT 'roll-asc',
 p_attendance text DEFAULT 'all',p_exam text DEFAULT 'ICA',p_status text DEFAULT 'all',p_min numeric DEFAULT NULL,p_max numeric DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE pattern text;
BEGIN
 IF p_size NOT BETWEEN 1 AND 250 OR p_page<0 OR p_attendance NOT IN ('all','recorded','missing','below75','atleast75') OR p_exam NOT IN ('ICA','IMF','FCA') OR p_status NOT IN ('all','recorded','missing') THEN RAISE EXCEPTION 'Invalid filter'; END IF;
 pattern:='%'||replace(replace(replace(btrim(p_search),E'\\',E'\\\\'),'%',E'\\%'),'_',E'\\_')||'%';
 RETURN (
 WITH base AS MATERIALIZED (
  SELECT s.*,sc.name school_name,sc.code school_code FROM public.students s JOIN public.schools sc ON sc.id=s.school_id
  WHERE s.school_id=p_school AND (p_class='all' OR s.class=p_class) AND (p_division='all' OR s.division=p_division)
   AND (p_search='' OR s.name ILIKE pattern OR s.student_code ILIKE pattern OR s.roll_number ILIKE pattern)
 ), latest AS (
  SELECT DISTINCT ON(e.student_id,e.exam_type) e.student_id,e.exam_type,e.score,e.remarks
  FROM public.exam_scores e JOIN base b ON e.student_id=b.id
  WHERE e.school_id=p_school AND e.exam_type IN ('ICA','MCA','IMF','FCA','ATTENDANCE')
  ORDER BY e.student_id,e.exam_type,e.updated_at DESC NULLS LAST,e.id DESC
 ), scores AS (
  SELECT student_id,max(score) FILTER(WHERE exam_type='ICA') ica,
   coalesce(max(score) FILTER(WHERE exam_type='MCA'),max(score) FILTER(WHERE exam_type='IMF')) mca,
   max(score) FILTER(WHERE exam_type='FCA') fca,max(score) FILTER(WHERE exam_type='ATTENDANCE') attendance_override,
   max(remarks) FILTER(WHERE exam_type='FCA') remarks FROM latest GROUP BY student_id
 ), att AS (
  SELECT a.student_id,count(*) n,round(100.0*count(*) FILTER(WHERE a.status='present')/count(*),1) pct
  FROM public.attendance a JOIN base b ON b.id=a.student_id WHERE a.school_id=p_school GROUP BY a.student_id
 ), enriched AS (
  SELECT b.*,s.ica,s.mca,s.fca,s.attendance_override,s.remarks,
   coalesce(s.attendance_override,a.pct,0) attendance_pct,
   (s.attendance_override IS NOT NULL OR coalesce(a.n,0)>0) attendance_recorded,
   round((coalesce(s.ica,0)+coalesce(s.mca,0)+coalesce(s.fca,0))/3.0,1) performance,
   CASE p_exam WHEN 'ICA' THEN s.ica WHEN 'IMF' THEN s.mca ELSE s.fca END filter_score
  FROM base b LEFT JOIN scores s ON s.student_id=b.id LEFT JOIN att a ON a.student_id=b.id
 ), filtered AS MATERIALIZED (
  SELECT e.*,CASE WHEN performance>=90 THEN 'Excellent' WHEN performance>=75 THEN 'Very Good' WHEN performance>=60 THEN 'Good' WHEN performance>=40 THEN 'Average' ELSE 'Needs Improvement' END status
  FROM enriched e WHERE
   (p_attendance='all' OR (p_attendance='recorded' AND attendance_recorded) OR (p_attendance='missing' AND NOT attendance_recorded) OR (p_attendance='below75' AND attendance_recorded AND attendance_pct<75) OR (p_attendance='atleast75' AND attendance_recorded AND attendance_pct>=75))
   AND (p_status='all' OR (p_status='recorded' AND filter_score IS NOT NULL) OR (p_status='missing' AND filter_score IS NULL))
   AND (p_min IS NULL OR filter_score>=p_min) AND (p_max IS NULL OR filter_score<=p_max)
 ), page AS (
  SELECT * FROM filtered ORDER BY
   CASE WHEN p_sort='name-asc' THEN name END ASC,
   CASE WHEN p_sort='name-desc' THEN name END DESC,
   CASE WHEN p_sort='roll-desc' THEN substring(roll_number from '^[+-]?[0-9]+')::numeric END DESC NULLS LAST,
   CASE WHEN p_sort NOT IN ('name-asc','name-desc','roll-desc') THEN substring(roll_number from '^[+-]?[0-9]+')::numeric END ASC NULLS LAST,
   roll_number,id LIMIT p_size OFFSET p_page::bigint*p_size
 ) SELECT jsonb_build_object('rows',coalesce((SELECT jsonb_agg(to_jsonb(page)-'filter_score') FROM page),'[]'::jsonb),'total',(SELECT count(*) FROM filtered))
 );
END $$;
REVOKE ALL ON FUNCTION public.student_details_page(uuid,text,text,text,integer,integer,text,text,text,text,numeric,numeric) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.student_details_page(uuid,text,text,text,integer,integer,text,text,text,text,numeric,numeric) TO service_role;

-- Keep score cleanup and student deletion atomic; exam_scores has no student FK.
CREATE OR REPLACE FUNCTION public.delete_student_details(p_school uuid,p_ids uuid[]) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
BEGIN
 IF cardinality(p_ids)>250 THEN RAISE EXCEPTION 'Batch too large'; END IF;
 DELETE FROM public.exam_scores e USING public.students s WHERE e.student_id=s.id AND s.school_id=p_school AND s.id=ANY(p_ids);
 DELETE FROM public.students WHERE school_id=p_school AND id=ANY(p_ids);
END $$;
REVOKE ALL ON FUNCTION public.delete_student_details(uuid,uuid[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.delete_student_details(uuid,uuid[]) TO service_role;
