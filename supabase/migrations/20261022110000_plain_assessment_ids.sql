-- Restore the original ASM-0001 display format without changing assessment UUIDs.
-- Requires 20261021120000_assessment_code_rename.sql for atomic dependent links.
BEGIN;
LOCK TABLE public.assessments IN SHARE ROW EXCLUSIVE MODE;
CREATE TABLE IF NOT EXISTS public.assessment_code_format_backup (
 assessment_uuid uuid PRIMARY KEY,
 old_code text NOT NULL,
 new_code text NOT NULL,
 changed_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.assessment_code_format_backup FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.assessment_code_format_backup TO service_role;
DO $$
DECLARE item record;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.assessments'::regclass
   AND tgname='cascade_assessment_code' AND NOT tgisinternal AND tgenabled<>'D') THEN
   RAISE EXCEPTION 'Apply assessment_code_rename migration before correcting assessment IDs';
 END IF;
 -- Never combine different assessments that happen to have the same suffix.
 IF EXISTS(
   SELECT 1 FROM public.assessments
   GROUP BY CASE WHEN assessment_id ~ '^ASM-[0-9]{4}-[0-9]{4,}$'
     THEN regexp_replace(assessment_id,'^ASM-[0-9]{4}-','ASM-') ELSE assessment_id END
   HAVING count(*)>1
 ) THEN RAISE EXCEPTION 'Assessment ID format conflict: duplicate suffixes must be resolved before migration. No IDs were changed.'; END IF;
 FOR item IN SELECT id,assessment_id,
   regexp_replace(assessment_id,'^ASM-[0-9]{4}-','ASM-') new_code
   FROM public.assessments WHERE assessment_id ~ '^ASM-[0-9]{4}-[0-9]{4,}$'
 LOOP
   INSERT INTO public.assessment_code_format_backup(assessment_uuid,old_code,new_code)
   VALUES(item.id,item.assessment_id,item.new_code) ON CONFLICT(assessment_uuid) DO NOTHING;
   UPDATE public.assessments SET assessment_id=item.new_code WHERE id=item.id;
 END LOOP;
END $$;
CREATE OR REPLACE FUNCTION public.assessment_plain_code()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF TG_OP='UPDATE' AND NEW.assessment_id IS NOT DISTINCT FROM OLD.assessment_id THEN
   RETURN NEW;
 END IF;
 IF NEW.assessment_id IS NULL OR NEW.assessment_id !~ '^ASM-[0-9]{4,}$' THEN
   RAISE EXCEPTION 'Use the original Assessment ID format, for example ASM-0121 (without a year).';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS assessment_plain_code ON public.assessments;
CREATE TRIGGER assessment_plain_code BEFORE INSERT OR UPDATE OF assessment_id ON public.assessments
FOR EACH ROW EXECUTE FUNCTION public.assessment_plain_code();
COMMIT;
