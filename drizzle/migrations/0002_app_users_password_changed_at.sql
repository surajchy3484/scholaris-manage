ALTER TABLE public.app_users
  ADD COLUMN IF NOT EXISTS password_changed_at timestamptz NOT NULL DEFAULT now();