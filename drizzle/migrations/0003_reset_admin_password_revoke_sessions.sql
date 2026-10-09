-- Set the admin account's new password and revoke every active session.
UPDATE public.app_users
SET password_hash = 'pbkdf2$100000$bb7d5eb410501d4c74503e77dfb44d6e$628ec28578a37092fa8548f575086f8a02b6093bf4f5bd1ab97fe1ab5bb51a9a'
WHERE lower(username) = 'reapstem';

-- Stamp every account so all tokens issued before now stop working.
UPDATE public.app_users SET password_changed_at = now();