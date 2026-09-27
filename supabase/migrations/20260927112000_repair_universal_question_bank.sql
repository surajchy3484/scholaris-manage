-- Recovery migration for deployments where the original universal question-bank
-- migration was recorded or deployed without its base tables.
CREATE OR REPLACE FUNCTION public.question_class(value text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN v ~ '^0*[0-9]+$' THEN (v::integer)::text ELSE upper(v) END
  FROM (SELECT btrim(regexp_replace(coalesce(value,''),'^\s*class\s*','','i')) v) s;
$$;

CREATE TABLE IF NOT EXISTS public.exam_types (
  name text PRIMARY KEY CHECK(name=upper(btrim(name)) AND length(name) BETWEEN 1 AND 80),
  visible boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.exam_types(name, visible)
VALUES ('ICA', true), ('MCA', false), ('FCA', false)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.exam_types(name)
SELECT DISTINCT upper(btrim(exam_type))
FROM public.assessments
WHERE length(btrim(exam_type)) BETWEEN 1 AND 80
ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.question_bank (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_type text NOT NULL REFERENCES public.exam_types(name),
  class text NOT NULL CHECK(class=public.question_class(class) AND class<>''),
  question_no integer NOT NULL CHECK(question_no BETWEEN 1 AND 10000),
  question_text text,
  correct_answer text NOT NULL CHECK(correct_answer IN ('A','B','C','D')),
  parameter text,
  chapter text,
  topic text,
  subject text,
  marks numeric NOT NULL DEFAULT 1 CHECK(marks>0),
  difficulty text NOT NULL DEFAULT 'Medium',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(exam_type, class, question_no)
);

DROP TRIGGER IF EXISTS question_bank_updated ON public.question_bank;
CREATE TRIGGER question_bank_updated
  BEFORE UPDATE ON public.question_bank
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE IF NOT EXISTS public.question_bank_migration_issues (
  assessment_id text PRIMARY KEY,
  exam_type text,
  class text,
  reason text NOT NULL,
  questions jsonb NOT NULL,
  resolved boolean NOT NULL DEFAULT false
);

ALTER TABLE public.exam_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_bank ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_bank_migration_issues ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.exam_types, public.question_bank, public.question_bank_migration_issues TO service_role;
