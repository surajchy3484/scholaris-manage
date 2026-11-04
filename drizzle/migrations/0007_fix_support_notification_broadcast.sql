CREATE OR REPLACE FUNCTION public.broadcast_support_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'realtime'
AS $function$
BEGIN
  PERFORM realtime.send(
    jsonb_build_object('notification_id', NEW.id),
    'schoolrise-support-notifications',
    'new',
    false
  );
  RETURN NEW;
END;
$function$;