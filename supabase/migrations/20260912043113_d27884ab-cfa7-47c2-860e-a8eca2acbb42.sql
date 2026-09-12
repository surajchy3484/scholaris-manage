CREATE TABLE public.app_users (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  username text NOT NULL,
  full_name text NOT NULL DEFAULT '',
  email text,
  phone text,
  role text NOT NULL DEFAULT 'trainer',
  password_hash text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  must_change_password boolean NOT NULL DEFAULT false,
  permissions jsonb NOT NULL DEFAULT '{}'::jsonb,
  school_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  all_schools boolean NOT NULL DEFAULT false,
  last_login_at timestamp with time zone,
  login_count integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX app_users_username_key ON public.app_users (lower(username));

GRANT ALL ON public.app_users TO service_role;

ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "app_users service role only" ON public.app_users
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TRIGGER app_users_updated
  BEFORE UPDATE ON public.app_users
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
