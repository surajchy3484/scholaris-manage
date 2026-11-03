-- Trainer support tickets. Ticket content is available only to trusted server functions.
create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  created_by uuid null references public.app_users(id) on delete set null,
  username text not null,
  full_name text not null default '',
  role text not null default 'trainer',
  subject text not null,
  description text not null,
  status text not null default 'open' check (status in ('open', 'in_progress', 'resolved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists support_tickets_created_at_idx
  on public.support_tickets (created_at desc);
create index if not exists support_tickets_status_idx
  on public.support_tickets (status, created_at desc);

alter table public.support_tickets enable row level security;
revoke all on table public.support_tickets from anon, authenticated;
grant all on table public.support_tickets to service_role;

do $$
declare p record;
begin
  for p in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'support_tickets'
  loop
    execute format('drop policy if exists %I on public.support_tickets', p.policyname);
  end loop;
end $$;

create policy "support tickets service role only"
  on public.support_tickets for all to service_role
  using (true) with check (true);
