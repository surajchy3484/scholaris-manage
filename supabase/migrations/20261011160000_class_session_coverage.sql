-- Additive compatibility migration: original sessions and statuses remain untouched.
BEGIN;
CREATE TABLE public.session_catalogue (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 academic_year text NOT NULL REFERENCES public.academic_years(id),
 class text NOT NULL,
 unit text NOT NULL CHECK(unit IN ('Unit-1','Unit-2','Unit-3','Unit-4')),
 session_name text NOT NULL,
 topic text NOT NULL DEFAULT '',
 name_key text GENERATED ALWAYS AS (lower(btrim(session_name))) STORED,
 topic_key text GENERATED ALWAYS AS (lower(btrim(topic))) STORED,
 UNIQUE(academic_year,class,unit,name_key,topic_key),
 UNIQUE(id,academic_year,class,unit)
);
ALTER TABLE public.session_catalogue ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.session_catalogue TO service_role;
ALTER TABLE public.sessions ADD COLUMN catalogue_id uuid REFERENCES public.session_catalogue(id);
CREATE FUNCTION public.link_session_catalogue() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 INSERT INTO session_catalogue(academic_year,class,unit,session_name,topic)
 VALUES(NEW.academic_year,NEW.class,NEW.unit,btrim(NEW.session_name),coalesce(btrim(NEW.topic),''))
 ON CONFLICT(academic_year,class,unit,name_key,topic_key) DO UPDATE SET name_key=DEFAULT
 RETURNING id INTO NEW.catalogue_id;
 RETURN NEW;
END $$;
-- Runs after the existing academic_record_year BEFORE trigger (alphabetical order).
CREATE TRIGGER zz_link_session_catalogue BEFORE INSERT OR UPDATE OF academic_year,class,unit,session_name,topic
 ON public.sessions FOR EACH ROW EXECUTE FUNCTION public.link_session_catalogue();
UPDATE public.sessions SET session_name=session_name;
ALTER TABLE public.sessions ADD CONSTRAINT sessions_catalogue_scope_fk
 FOREIGN KEY(catalogue_id,academic_year,class,unit) REFERENCES public.session_catalogue(id,academic_year,class,unit);
CREATE INDEX session_catalogue_deliveries_idx ON public.sessions(academic_year,catalogue_id,school_id);
CREATE INDEX IF NOT EXISTS coverage_roster_idx ON public.student_enrollments(academic_year,class,school_id,division);
CREATE INDEX IF NOT EXISTS coverage_status_idx ON public.session_division_status(academic_year,session_id,school_id,division);

CREATE TABLE public.session_school_assignments (
 catalogue_id uuid NOT NULL REFERENCES public.session_catalogue(id),
 school_id uuid NOT NULL REFERENCES public.schools(id),
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','cancelled')),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(catalogue_id,school_id)
);
ALTER TABLE public.session_school_assignments ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.session_school_assignments TO service_role;
CREATE TABLE public.session_coverage_settings (
 academic_year text PRIMARY KEY REFERENCES public.academic_years(id),
 almost_all numeric NOT NULL DEFAULT 80,
 partial numeric NOT NULL DEFAULT 50,
 CHECK(partial>0 AND partial<almost_all AND almost_all<100)
);
ALTER TABLE public.session_coverage_settings ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.session_coverage_settings TO service_role;

-- Explicit school-level projection from legacy division deliveries; no synthetic Complete statuses.
-- The server must supply its authorized school IDs. Details are fetched only on demand.
CREATE FUNCTION public.reap_class_session_coverage(p_year text,p_class text,p_schools uuid[],p_session uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SET search_path=public AS $$
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
 CASE WHEN bool_and(l.status='complete' AND l.status IS NOT NULL) THEN 'Completed'
 WHEN bool_or(l.status IS NULL) THEN 'Not Recorded' ELSE 'Not Completed' END status,
 count(*) FILTER(WHERE l.status IS NULL)::integer missing_divisions,
 max(l.updated_at) FILTER(WHERE l.status='complete') completion_updated_at,
 jsonb_agg(jsonb_build_object('division',e.division,'status',coalesce(l.status,'not_recorded'),
 'updated_at',l.updated_at,'updated_by',l.updated_by) ORDER BY e.division) divisions
 FROM eligible e LEFT JOIN latest l ON l.catalogue_id=e.id AND l.school_id=e.school_id AND l.division=e.division
 GROUP BY e.id,e.school_id
), metrics AS (
 SELECT c.id,c.class,c.unit,c.session_name,c.topic,count(d.school_id)::integer eligible,
 count(d.school_id) FILTER(WHERE d.status='Completed')::integer completed,
 count(d.school_id) FILTER(WHERE d.status='Not Completed')::integer pending,
 count(d.school_id) FILTER(WHERE d.status='Not Recorded')::integer not_recorded
 FROM catalogue c LEFT JOIN school_delivery d ON d.id=c.id
 GROUP BY c.id,c.class,c.unit,c.session_name,c.topic
)
SELECT jsonb_build_object('metrics',coalesce((SELECT jsonb_agg(m ORDER BY unit,session_name,id) FROM metrics m),'[]'::jsonb),
 'details',CASE WHEN p_session IS NULL THEN '[]'::jsonb ELSE coalesce((SELECT jsonb_agg(d ORDER BY school_id) FROM school_delivery d),'[]'::jsonb) END)
$$;
REVOKE ALL ON FUNCTION public.reap_class_session_coverage(text,text,uuid[],uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reap_class_session_coverage(text,text,uuid[],uuid) TO service_role;
COMMIT;
