BEGIN;

-- Keep existing pending/complete rows unchanged while allowing NA on both the
-- legacy master table and the per-division status table.
ALTER TABLE public.sessions DROP CONSTRAINT IF EXISTS sessions_status_check;
ALTER TABLE public.sessions
  ADD CONSTRAINT sessions_status_check CHECK (status IN ('pending', 'complete', 'na'));

ALTER TABLE public.session_division_status
  DROP CONSTRAINT IF EXISTS session_division_status_status_check;
ALTER TABLE public.session_division_status
  ADD CONSTRAINT session_division_status_status_check
  CHECK (status IN ('pending', 'complete', 'na'));

-- NA divisions do not contribute to the applicable denominator. A school is
-- Not Applicable only when every roster division is NA; mixed schools are
-- evaluated using their remaining applicable divisions.
CREATE OR REPLACE FUNCTION public.reap_class_session_coverage(
  p_year text,
  p_class text,
  p_schools uuid[],
  p_session uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE sql STABLE SET search_path=public AS $$
WITH catalogue AS (
  SELECT * FROM session_catalogue WHERE academic_year=p_year AND class=p_class
    AND (p_session IS NULL OR id=p_session)
), roster AS (
  SELECT DISTINCT school_id,coalesce(division,'') division FROM student_enrollments
  WHERE academic_year=p_year AND class=p_class AND school_id=ANY(p_schools)
), eligible AS (
  SELECT c.id,r.school_id,r.division FROM catalogue c CROSS JOIN roster r
  LEFT JOIN session_school_assignments a ON a.catalogue_id=c.id AND a.school_id=r.school_id
  WHERE coalesce(a.status,'active')<>'cancelled'
), latest AS (
  SELECT DISTINCT ON(s.catalogue_id,d.school_id,coalesce(d.division,''))
    s.catalogue_id,d.school_id,coalesce(d.division,'') division,d.status,d.updated_at,d.updated_by
  FROM sessions s JOIN session_division_status d ON d.session_id=s.id
    AND d.school_id=s.school_id AND d.academic_year=s.academic_year
  JOIN catalogue c ON c.id=s.catalogue_id
  WHERE s.academic_year=p_year AND s.class=p_class AND d.school_id=ANY(p_schools)
  ORDER BY s.catalogue_id,d.school_id,coalesce(d.division,''),d.updated_at DESC,d.id DESC
), school_delivery AS (
  SELECT e.id,e.school_id,
    CASE
      WHEN count(*) FILTER (WHERE coalesce(l.status,'pending') <> 'na') = 0 THEN 'Not Applicable'
      WHEN count(*) FILTER (WHERE l.status='complete') = count(*) FILTER (WHERE coalesce(l.status,'pending') <> 'na') THEN 'Completed'
      WHEN bool_or(l.status IS NULL) THEN 'Not Recorded'
      ELSE 'Not Completed'
    END status,
    count(*) FILTER (WHERE l.status IS NULL)::integer missing_divisions,
    max(l.updated_at) FILTER (WHERE l.status='complete') completion_updated_at,
    jsonb_agg(jsonb_build_object('division',e.division,'status',coalesce(l.status,'not_recorded'),
      'updated_at',l.updated_at,'updated_by',l.updated_by) ORDER BY e.division) divisions
  FROM eligible e LEFT JOIN latest l ON l.catalogue_id=e.id AND l.school_id=e.school_id AND l.division=e.division
  GROUP BY e.id,e.school_id
), metrics AS (
  SELECT c.id,c.class,c.unit,c.session_name,c.topic,
    count(d.school_id) FILTER (WHERE d.status <> 'Not Applicable')::integer eligible,
    count(d.school_id) FILTER (WHERE d.status='Completed')::integer completed,
    count(d.school_id) FILTER (WHERE d.status='Not Completed')::integer pending,
    count(d.school_id) FILTER (WHERE d.status='Not Recorded')::integer not_recorded,
    count(d.school_id) FILTER (WHERE d.status='Not Applicable')::integer not_applicable
  FROM catalogue c LEFT JOIN school_delivery d ON d.id=c.id
  GROUP BY c.id,c.class,c.unit,c.session_name,c.topic
)
SELECT jsonb_build_object(
  'metrics',coalesce((SELECT jsonb_agg(m ORDER BY unit,session_name,id) FROM metrics m),'[]'::jsonb),
  'details',CASE WHEN p_session IS NULL THEN '[]'::jsonb
    ELSE coalesce((SELECT jsonb_agg(d ORDER BY school_id) FROM school_delivery d),'[]'::jsonb) END
)
$$;

CREATE OR REPLACE FUNCTION public.academic_student_history(p_student uuid,p_schools uuid[] DEFAULT NULL) RETURNS jsonb LANGUAGE sql STABLE SET search_path=public AS $$
SELECT jsonb_build_object(
 'enrollments',(SELECT coalesce(jsonb_agg(to_jsonb(e)||jsonb_build_object('school_name',s.name) ORDER BY e.academic_year),'[]') FROM student_enrollments e JOIN schools s ON e.school_id=s.id WHERE e.student_id=p_student AND (p_schools IS NULL OR e.school_id=ANY(p_schools))),
 'results',(SELECT coalesce(jsonb_agg(r ORDER BY r.academic_year,r.calculated_at),'[]') FROM assessment_results r WHERE r.student_id=p_student AND (p_schools IS NULL OR r.school_id=ANY(p_schools))),
 'scores',(SELECT coalesce(jsonb_agg(r ORDER BY r.academic_year,r.updated_at),'[]') FROM exam_scores r WHERE r.student_id=p_student AND (p_schools IS NULL OR r.school_id=ANY(p_schools))),
 'attendance',(SELECT coalesce(jsonb_agg(t),'[]') FROM (SELECT academic_year,round(100.0*count(*) FILTER(WHERE status='present')/nullif(count(*),0),1) percentage FROM attendance WHERE student_id=p_student AND (p_schools IS NULL OR school_id=ANY(p_schools)) GROUP BY academic_year) t),
 'sessions',(SELECT coalesce(jsonb_agg(t),'[]') FROM (SELECT e.academic_year,u.unit,
   count(s.id) FILTER (WHERE coalesce(d.status,'pending') <> 'na') total,
   count(s.id) FILTER (WHERE d.status='complete') complete,
   count(s.id) FILTER (WHERE d.status='na') not_applicable
   FROM student_enrollments e CROSS JOIN (VALUES('Unit-1'),('Unit-2'),('Unit-3'),('Unit-4')) u(unit)
   LEFT JOIN sessions s ON s.school_id=e.school_id AND s.academic_year=e.academic_year AND s.class=e.class AND s.unit=u.unit
   LEFT JOIN session_division_status d ON d.session_id=s.id AND d.division=e.division AND d.academic_year=e.academic_year
   WHERE e.student_id=p_student AND (p_schools IS NULL OR e.school_id=ANY(p_schools))
   GROUP BY e.academic_year,u.unit) t)
);
$$;

NOTIFY pgrst, 'reload schema';
COMMIT;
