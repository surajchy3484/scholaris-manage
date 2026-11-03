ALTER TABLE public.support_tickets DROP CONSTRAINT IF EXISTS support_tickets_status_check;

UPDATE public.support_tickets SET status = 'Open' WHERE status = 'open';
UPDATE public.support_tickets SET status = 'In Progress' WHERE status = 'in_progress';
UPDATE public.support_tickets SET status = 'Resolved' WHERE status = 'resolved';

ALTER TABLE public.support_tickets ADD CONSTRAINT support_tickets_status_check
  CHECK (status IN ('Open','Under Review','In Progress','Pending User Response','Resolved','Closed','Reopened'));

COMMENT ON COLUMN public.support_tickets.status IS 'Workflow status stored in the app''s Title Case values; replaces the earlier lowercase open/in_progress/resolved check.';