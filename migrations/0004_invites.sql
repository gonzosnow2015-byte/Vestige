-- Pending email invites. One address can have one open invite, and accepting
-- it is the only way that address joins a company. The app does not send mail;
-- the invited person joins by creating a password or signing in with Google
-- using this exact address (letter case ignored).

create table if not exists invites (
  id text primary key default gen_random_uuid()::text,
  company_id text not null references companies (id) on delete cascade,
  email text not null,
  role text not null check (role in ('admin', 'inspector', 'viewer')),
  invited_by text not null references "user" (id) on delete cascade,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  accepted_user_id text references "user" (id) on delete set null
);

create unique index if not exists invites_pending_email_uidx
  on invites (lower(email))
  where accepted_at is null;

create index if not exists invites_company_idx on invites (company_id);

alter table invites enable row level security;

drop policy if exists invites_tenant on invites;
create policy invites_tenant on invites
  for all
  using (company_id = app_company_id())
  with check (company_id = app_company_id());
