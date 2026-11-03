BEGIN;

-- The support UI stores workflow statuses in Title Case. Older migrations could
-- leave the column default as lowercase `open`, which violates the newer check.
UPDATE public.support_tickets
SET status = CASE status
  WHEN 'open' THEN 'Open'
  WHEN 'in_progress' THEN 'In Progress'
  WHEN 'resolved' THEN 'Resolved'
  ELSE status
END
WHERE status IN ('open', 'in_progress', 'resolved');

ALTER TABLE public.support_tickets
  DROP CONSTRAINT IF EXISTS support_tickets_status_check;

ALTER TABLE public.support_tickets
  ALTER COLUMN status SET DEFAULT 'Open';

ALTER TABLE public.support_tickets
  ADD CONSTRAINT support_tickets_status_check
  CHECK (status IN ('Open', 'Under Review', 'In Progress', 'Pending User Response', 'Resolved', 'Closed', 'Reopened'));

COMMIT;
