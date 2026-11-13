BEGIN;

-- Realtime is only a refresh hint. It must never prevent the underlying
-- notification row from being stored and shown on the next bell refresh.
CREATE OR REPLACE FUNCTION public.broadcast_support_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  BEGIN
    PERFORM realtime.broadcast(
      'schoolrise-support-notifications',
      'new',
      jsonb_build_object('notification_id', NEW.id),
      false
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'support notification realtime refresh skipped: %', SQLERRM;
  END;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.broadcast_message_refresh()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  BEGIN
    PERFORM realtime.broadcast(
      'schoolrise-support-notifications',
      'new',
      jsonb_build_object('broadcast_id', NEW.broadcast_id),
      false
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'broadcast realtime refresh skipped: %', SQLERRM;
  END;
  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';
COMMIT;
