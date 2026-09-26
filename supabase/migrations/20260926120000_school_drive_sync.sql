-- Drive stores workbooks, not database credentials. Only the trusted server can sync.
CREATE TABLE public.school_drive_sync (
 school_id uuid PRIMARY KEY REFERENCES public.schools(id) ON DELETE CASCADE,
 file_id text,
 baseline jsonb NOT NULL DEFAULT '{}'::jsonb,
 synced_at timestamptz,
 lease uuid,
 lease_until timestamptz
);
ALTER TABLE public.school_drive_sync ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.school_drive_sync FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.school_drive_sync TO service_role;
CREATE POLICY school_drive_sync_server ON public.school_drive_sync FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE FUNCTION public.school_drive_acquire(p_school uuid, p_lease uuid) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE result jsonb;
BEGIN
 INSERT INTO school_drive_sync(school_id) VALUES(p_school) ON CONFLICT DO NOTHING;
 UPDATE school_drive_sync SET lease=p_lease,lease_until=now()+interval '5 minutes'
 WHERE school_id=p_school AND (lease IS NULL OR lease_until<now())
 RETURNING to_jsonb(school_drive_sync.*) INTO result;
 IF result IS NULL THEN RAISE EXCEPTION 'A sync is already running for this school. Try again shortly.'; END IF;
 RETURN result;
END $$;

CREATE FUNCTION public.school_drive_finish(p_school uuid,p_lease uuid,p_file text,p_baseline jsonb) RETURNS void
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
 UPDATE school_drive_sync SET file_id=p_file,baseline=p_baseline,synced_at=now(),lease=NULL,lease_until=NULL
 WHERE school_id=p_school AND lease=p_lease AND lease_until>now();
 IF NOT FOUND THEN RAISE EXCEPTION 'Sync lease expired. Retry to reconcile changes.'; END IF;
END $$;

-- A single statement snapshot avoids inconsistent exports when tables change during pagination.
CREATE FUNCTION public.school_drive_snapshot(p_school uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = public AS $$
 SELECT jsonb_build_object(
 'schools',(SELECT coalesce(jsonb_agg(t ORDER BY id),'[]') FROM schools t WHERE id=p_school),
 'students',(SELECT coalesce(jsonb_agg(t ORDER BY id),'[]') FROM students t WHERE school_id=p_school),
 'attendance',(SELECT coalesce(jsonb_agg(t ORDER BY id),'[]') FROM attendance t WHERE school_id=p_school),
 'exam_scores',(SELECT coalesce(jsonb_agg(t ORDER BY id),'[]') FROM exam_scores t WHERE school_id=p_school),
 'assessments',(SELECT coalesce(jsonb_agg(t ORDER BY id),'[]') FROM assessments t WHERE school_id=p_school),
 'questions',(SELECT coalesce(jsonb_agg(t ORDER BY id),'[]') FROM questions t WHERE assessment_id IN (SELECT assessment_id FROM assessments WHERE school_id=p_school)),
 'sessions',(SELECT coalesce(jsonb_agg(t ORDER BY id),'[]') FROM sessions t WHERE school_id=p_school),
 'school_divisions',(SELECT coalesce(jsonb_agg(t ORDER BY id),'[]') FROM school_divisions t WHERE school_id=p_school),
 'session_division_status',(SELECT coalesce(jsonb_agg(t ORDER BY id),'[]') FROM session_division_status t WHERE school_id=p_school),
 'clicker_records',(SELECT coalesce(jsonb_agg(t ORDER BY id),'[]') FROM clicker_records t WHERE school_id=p_school),
 'assessment_results',(SELECT coalesce(jsonb_agg(t ORDER BY id),'[]') FROM assessment_results t WHERE school_id=p_school)
 );
$$;

-- Each batch is atomic. Optimistic matching protects edits made after the snapshot.
CREATE FUNCTION public.school_drive_apply(p_school uuid,p_lease uuid,p_changes jsonb) RETURNS integer
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE change jsonb; tab text; allowed text[]; assignments text; affected integer; total integer:=0;
BEGIN
 PERFORM 1 FROM school_drive_sync WHERE school_id=p_school AND lease=p_lease AND lease_until>now() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Sync lease expired'; END IF;
 UPDATE school_drive_sync SET lease_until=now()+interval '5 minutes' WHERE school_id=p_school;
 IF jsonb_typeof(p_changes)<>'array' OR jsonb_array_length(p_changes)>250 THEN RAISE EXCEPTION 'Invalid sync batch'; END IF;
 FOR change IN SELECT value FROM jsonb_array_elements(p_changes) LOOP
  tab:=change->>'table';
  allowed:=CASE tab WHEN 'schools' THEN ARRAY['location'] WHEN 'students' THEN ARRAY['name','roll_number','enrollment_date'] WHEN 'attendance' THEN ARRAY['date','status'] WHEN 'exam_scores' THEN ARRAY['score','remarks'] WHEN 'session_division_status' THEN ARRAY['status'] ELSE NULL END;
  IF allowed IS NULL OR jsonb_typeof(change->'values') IS DISTINCT FROM 'object' OR change->'values'='{}'::jsonb OR jsonb_typeof(change->'expected') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid sync change'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(change->'values') k WHERE NOT k=ANY(allowed)) THEN RAISE EXCEPTION 'Read-only field'; END IF;
  IF tab='students' AND change->'values' ? 'name' AND coalesce(btrim(change->'values'->>'name'),'')='' THEN RAISE EXCEPTION 'Student name is required'; END IF;
  IF tab='exam_scores' AND change->'values' ? 'score' AND ((change->'values'->>'score')::numeric<0 OR (change->'values'->>'score') IS NULL) THEN RAISE EXCEPTION 'Score must be zero or greater'; END IF;
  SELECT string_agg(format('%I = r.%I',k,k),', ') INTO assignments FROM jsonb_object_keys(change->'values') k;
  EXECUTE format('UPDATE public.%I t SET %s FROM jsonb_populate_record(NULL::public.%I,$1) r WHERE t.id=$2 AND t.%I=$3 AND to_jsonb(t) @> $4',tab,assignments,tab,CASE WHEN tab='schools' THEN 'id' ELSE 'school_id' END)
  USING change->'values',(change->>'id')::uuid,p_school,change->'expected';
  GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected<>1 THEN RAISE EXCEPTION 'Record changed during sync: % %; retry',tab,change->>'id'; END IF;
  total:=total+affected;
 END LOOP;
 RETURN total;
END $$;
REVOKE ALL ON FUNCTION public.school_drive_acquire(uuid,uuid),public.school_drive_finish(uuid,uuid,text,jsonb),public.school_drive_snapshot(uuid),public.school_drive_apply(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.school_drive_acquire(uuid,uuid),public.school_drive_finish(uuid,uuid,text,jsonb),public.school_drive_snapshot(uuid),public.school_drive_apply(uuid,uuid,jsonb) TO service_role;
CREATE FUNCTION public.school_drive_release(p_school uuid,p_lease uuid) RETURNS void
LANGUAGE sql SET search_path = public AS $$
 UPDATE school_drive_sync SET lease=NULL,lease_until=NULL WHERE school_id=p_school AND lease=p_lease;
$$;
REVOKE ALL ON FUNCTION public.school_drive_release(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.school_drive_release(uuid,uuid) TO service_role;
