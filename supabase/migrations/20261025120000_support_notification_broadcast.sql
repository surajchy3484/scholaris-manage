BEGIN;

-- Broadcast only a refresh signal. No ticket description, student data, or
-- attachment information is exposed to realtime clients. Each client then
-- reloads its own notifications through the authorized server function.
CREATE OR REPLACE FUNCTION public.broadcast_support_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM realtime.broadcast(
    'schoolrise-support-notifications',
    'new',
    jsonb_build_object('notification_id', NEW.id),
    false
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS support_notification_broadcast
  ON public.support_notifications;
CREATE TRIGGER support_notification_broadcast
  AFTER INSERT ON public.support_notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.broadcast_support_notification();

REVOKE ALL ON FUNCTION public.broadcast_support_notification() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.broadcast_support_notification() TO service_role;

COMMIT;
