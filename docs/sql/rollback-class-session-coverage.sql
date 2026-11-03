-- First revert the application release. Export these new tables before rollback if used:
-- session_catalogue, session_school_assignments, session_coverage_settings.
-- Original sessions and session_division_status records are retained.
BEGIN;
DROP FUNCTION IF EXISTS public.reap_class_session_coverage(text,text,uuid[],uuid);
DROP TRIGGER IF EXISTS zz_link_session_catalogue ON public.sessions;
DROP FUNCTION IF EXISTS public.link_session_catalogue();
ALTER TABLE public.sessions DROP CONSTRAINT IF EXISTS sessions_catalogue_scope_fk;
ALTER TABLE public.sessions DROP COLUMN IF EXISTS catalogue_id;
DROP TABLE IF EXISTS public.session_school_assignments;
DROP TABLE IF EXISTS public.session_coverage_settings;
DROP TABLE IF EXISTS public.session_catalogue;
DROP INDEX IF EXISTS public.coverage_roster_idx;
DROP INDEX IF EXISTS public.coverage_status_idx;
COMMIT;
