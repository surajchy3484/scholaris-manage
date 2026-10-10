-- Additive only. Existing rows, years, targets and status history are untouched.
CREATE TABLE IF NOT EXISTS public.session_activities (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 name text NOT NULL,
 unit text NOT NULL CHECK (unit IN ('Unit-1','Unit-2','Unit-3','Unit-4')),
 UNIQUE(id,unit)
);
ALTER TABLE public.session_activities ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.session_activities TO service_role;
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS activity_id uuid;
ALTER TABLE public.sessions ADD CONSTRAINT sessions_activity_unit_fk FOREIGN KEY(activity_id,unit) REFERENCES public.session_activities(id,unit);
CREATE INDEX IF NOT EXISTS attendance_dashboard_scope_idx ON public.attendance(academic_year,school_id,date,student_id);
CREATE INDEX IF NOT EXISTS enrollments_dashboard_scope_idx ON public.student_enrollments(academic_year,school_id,class,division);
-- Service-role only: the server resolves permissions and supplies the school allowlist.
CREATE OR REPLACE FUNCTION public.reap_dashboard_attendance(p_year text,p_schools uuid[],p_start date,p_end date,p_class text DEFAULT NULL,p_division text DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SET search_path=public AS $$
WITH roster AS (
 SELECT DISTINCT student_id,school_id,class,coalesce(division,'') division FROM student_enrollments
 WHERE academic_year=p_year AND school_id=ANY(p_schools)
 AND (p_class IS NULL OR class=p_class) AND (p_division IS NULL OR coalesce(division,'')=p_division)
), cohorts AS (
 SELECT school_id,class,division,count(*) students FROM roster GROUP BY school_id,class,division
), marks AS (
 SELECT DISTINCT ON(a.student_id,a.date) a.student_id,a.school_id,a.date,a.status,r.class,r.division
 FROM attendance a JOIN roster r ON r.student_id=a.student_id AND r.school_id=a.school_id
 WHERE a.academic_year=p_year AND a.date BETWEEN p_start AND p_end AND a.status IN ('present','absent')
 ORDER BY a.student_id,a.date,a.created_at DESC,a.id DESC
), daily AS (
 SELECT m.school_id,m.class,m.division,m.date,count(*) recorded,count(*) FILTER(WHERE status='present') present,c.students expected
 FROM marks m JOIN cohorts c USING(school_id,class,division)
 GROUP BY m.school_id,m.class,m.division,m.date,c.students
)
SELECT jsonb_build_object('cohorts',coalesce((SELECT jsonb_agg(cohorts) FROM cohorts),'[]'::jsonb),
 'attendance',coalesce((SELECT jsonb_agg(daily ORDER BY date,school_id,class,division) FROM daily),'[]'::jsonb));
$$;
REVOKE ALL ON FUNCTION public.reap_dashboard_attendance(text,uuid[],date,date,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reap_dashboard_attendance(text,uuid[],date,date,text,text) TO service_role;
NOTIFY pgrst,'reload schema';
CREATE UNIQUE INDEX IF NOT EXISTS sessions_activity_delivery_scope_idx ON public.sessions(academic_year,school_id,class,activity_id) WHERE activity_id IS NOT NULL;
