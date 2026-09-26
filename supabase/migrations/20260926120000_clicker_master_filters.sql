-- Add optional Clicker Master filters without changing the existing RPC signature.
-- The application also has a compatibility path for environments where this
-- migration has not been applied yet.
CREATE OR REPLACE FUNCTION public.performance_master_page(
  p_table text,
  p_page integer DEFAULT 0,
  p_size integer DEFAULT 25,
  p_search text DEFAULT '',
  p_sort text DEFAULT NULL,
  p_desc boolean DEFAULT false,
  p_assessment text DEFAULT 'all',
  p_subject text DEFAULT '',
  p_min_score numeric DEFAULT NULL,
  p_schools uuid[] DEFAULT NULL,
  p_class text DEFAULT '',
  p_section text DEFAULT '',
  p_team text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE
  predicate text := 'true';
  ordering text;
  result jsonb;
  total bigint;
  columns jsonb := '[]';
  allowed text[];
  search_columns text[];
  search_parts text[] := '{}';
  col text;
  pattern text;
BEGIN
  IF p_table NOT IN ('assessments','questions','clicker_records') OR p_size NOT BETWEEN 1 AND 250 OR p_page < 0 THEN
    RAISE EXCEPTION 'Invalid paging request';
  END IF;

  IF p_table = 'assessments' THEN
    allowed := ARRAY['assessment_id','name','school_name','class','section','exam_type','date','total_questions','status','created_at'];
    search_columns := ARRAY['assessment_id','name','school_name','class','section','exam_type','status','subject'];
  ELSIF p_table = 'questions' THEN
    allowed := ARRAY['assessment_id','question_no','correct_answer','parameter','topic','chapter','subject','marks','difficulty','status'];
    search_columns := ARRAY['assessment_id','correct_answer','parameter','topic','chapter','subject','question_text'];
  ELSE
    allowed := ARRAY['assessment_id','keypad_id','student_name','roll_number','school_name','class','section','team','score','correct_rate','ranking'];
    search_columns := ARRAY['assessment_id','keypad_id','student_name','roll_number','school_name','class','section','team'];
  END IF;

  IF p_schools IS NOT NULL THEN
    IF p_table = 'questions' THEN
      predicate := predicate || format(' AND t.assessment_id IN (SELECT a.assessment_id FROM public.assessments a WHERE a.school_id=ANY(%L::uuid[]))', p_schools);
    ELSE
      predicate := predicate || format(' AND t.school_id=ANY(%L::uuid[])', p_schools);
    END IF;
  END IF;
  IF p_assessment <> 'all' THEN predicate := predicate || format(' AND t.assessment_id=%L', p_assessment); END IF;
  IF p_subject <> '' AND p_table = 'questions' THEN
    predicate := predicate || format(' AND t.subject ILIKE %L', '%' || replace(replace(replace(p_subject,E'\\',E'\\\\'),'%',E'\\%'),'_',E'\\_') || '%');
  END IF;
  IF p_min_score IS NOT NULL AND p_table = 'clicker_records' THEN predicate := predicate || format(' AND t.score >= %L', p_min_score); END IF;
  IF p_class <> '' AND p_table = 'clicker_records' THEN predicate := predicate || format(' AND t.class ILIKE %L', '%' || replace(replace(replace(p_class,E'\\',E'\\\\'),'%',E'\\%'),'_',E'\\_') || '%'); END IF;
  IF p_section <> '' AND p_table = 'clicker_records' THEN predicate := predicate || format(' AND t.section ILIKE %L', '%' || replace(replace(replace(p_section,E'\\',E'\\\\'),'%',E'\\%'),'_',E'\\_') || '%'); END IF;
  IF p_team <> '' AND p_table = 'clicker_records' THEN predicate := predicate || format(' AND t.team ILIKE %L', '%' || replace(replace(replace(p_team,E'\\',E'\\\\'),'%',E'\\%'),'_',E'\\_') || '%'); END IF;

  IF btrim(p_search) <> '' THEN
    pattern := '%' || replace(replace(replace(btrim(p_search),E'\\',E'\\\\'),'%',E'\\%'),'_',E'\\_') || '%';
    FOREACH col IN ARRAY search_columns LOOP search_parts := array_append(search_parts, format('t.%I ILIKE %L', col, pattern)); END LOOP;
    FOREACH col IN ARRAY allowed LOOP IF NOT col = ANY(search_columns) THEN search_parts := array_append(search_parts, format('t.%I::text ILIKE %L', col, pattern)); END IF; END LOOP;
    IF p_table = 'clicker_records' THEN search_parts := array_append(search_parts, format('t.answers::text ILIKE %L', pattern)); END IF;
    predicate := predicate || ' AND (' || array_to_string(search_parts, ' OR ') || ')';
  END IF;

  IF p_sort = ANY(allowed) THEN ordering := format('t.%I', p_sort);
  ELSIF p_table = 'clicker_records' AND p_sort ~ '^S[0-9]+$' THEN ordering := format('(t.answers->>%L)', p_sort);
  ELSE ordering := CASE p_table WHEN 'assessments' THEN 't.created_at' WHEN 'questions' THEN 't.question_no' ELSE 't.ranking' END;
  END IF;
  ordering := ordering || CASE WHEN p_desc OR (p_table = 'assessments' AND p_sort IS NULL) THEN ' DESC' ELSE ' ASC' END || ' NULLS LAST,t.id ASC';

  EXECUTE format('SELECT count(*) FROM public.%I t WHERE %s', p_table, predicate) INTO total;
  EXECUTE format('SELECT coalesce(jsonb_agg(to_jsonb(page)),''[]''::jsonb) FROM (SELECT t.* FROM public.%I t WHERE %s ORDER BY %s LIMIT %s OFFSET %s) page', p_table, predicate, ordering, p_size, p_page::bigint * p_size) INTO result;

  IF p_table = 'clicker_records' AND p_page = 0 THEN
    EXECUTE format('SELECT coalesce(jsonb_agg(k ORDER BY substring(k,2)::int),''[]''::jsonb) FROM (SELECT DISTINCT upper(keys.k) k FROM public.clicker_records c CROSS JOIN LATERAL jsonb_object_keys(c.answers) keys(k) WHERE upper(keys.k) ~ ''^S[0-9]+$'' AND (%L=''all'' OR c.assessment_id=%L) AND (%L::uuid[] IS NULL OR c.school_id=ANY(%L::uuid[]))) cols', p_assessment, p_assessment, p_schools, p_schools) INTO columns;
  END IF;
  RETURN jsonb_build_object('rows', result, 'total', total, 'questionColumns', columns);
END $$;

REVOKE ALL ON FUNCTION public.performance_master_page(text,integer,integer,text,text,boolean,text,text,numeric,uuid[],text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.performance_master_page(text,integer,integer,text,text,boolean,text,text,numeric,uuid[],text,text,text) TO service_role;
