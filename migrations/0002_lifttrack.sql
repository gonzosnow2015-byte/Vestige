-- LiftTrack: multi-tenant lifting-equipment register.
--
-- Identity lives in Better Auth's "user" table (migrations/0001_auth.sql).
-- This "users" table is the company membership: one account, one company,
-- role admin | inspector | viewer. ids are text so they match Better Auth
-- (a uuid column breaks the preview).
--
-- Row isolation
-- The app connects as the table owner through a pooled driver. Owners bypass
-- row level security unless it is FORCEd, and a pooled connection does not
-- keep SET session variables between statements — so FORCE plus
-- current_setting('app.user_id') would either no-op (superuser) or break
-- every query. Policies below are the tenant contract for a future non-owner
-- role. The running app enforces the same boundary in src/lib/lift/server.ts:
-- authMiddleware resolves the signed-in user, and every read and write is
-- filtered by that user's company_id. Client-supplied company ids are ignored.
--
-- On a Supabase-style non-owner role, set `app.user_id` to the account id
-- for the transaction before querying. Do not point these policies at
-- auth.uid(); this database has no Supabase auth schema.

create table if not exists companies (
  id text primary key default gen_random_uuid()::text,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists users (
  id text primary key references "user" (id) on delete cascade,
  company_id text not null references companies (id) on delete cascade,
  email text not null,
  role text not null check (role in ('admin', 'inspector', 'viewer')),
  created_at timestamptz not null default now()
);

create index if not exists users_company_id_idx on users (company_id);

create table if not exists assets (
  id text primary key default gen_random_uuid()::text,
  company_id text not null references companies (id) on delete cascade,
  part_number text not null,
  type text not null,
  description text not null default '',
  swl text,
  manufacturer text,
  serial_number text,
  location text,
  status text not null default 'in_service'
    check (status in ('in_service', 'quarantine', 'out_of_service', 'scrapped')),
  next_due_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists assets_company_part_uidx
  on assets (company_id, lower(part_number));
create index if not exists assets_company_due_idx
  on assets (company_id, next_due_date);

create table if not exists inspections (
  id text primary key default gen_random_uuid()::text,
  company_id text not null references companies (id) on delete cascade,
  asset_id text not null references assets (id) on delete cascade,
  inspection_date date not null,
  result text not null check (result in ('pass', 'fail', 'conditional')),
  next_due_date date,
  inspector_name text not null,
  job_reference text,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists inspections_asset_idx
  on inspections (asset_id, inspection_date desc);
create index if not exists inspections_company_idx
  on inspections (company_id, inspection_date desc);

-- Certificate PDFs and photos. file_path is the object-storage key
-- (company / asset / file). Bytes are not stored here.
create table if not exists files (
  id text primary key default gen_random_uuid()::text,
  company_id text not null references companies (id) on delete cascade,
  inspection_id text references inspections (id) on delete cascade,
  asset_id text references assets (id) on delete cascade,
  file_path text not null,
  file_name text not null,
  uploaded_at timestamptz not null default now(),
  constraint files_has_parent check (inspection_id is not null or asset_id is not null)
);

create index if not exists files_company_idx on files (company_id);
create index if not exists files_asset_idx on files (asset_id);
create index if not exists files_inspection_idx on files (inspection_id);

create or replace function touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists assets_touch on assets;
create trigger assets_touch
  before update on assets
  for each row execute procedure touch_updated_at();

create or replace function inspections_same_company()
returns trigger
language plpgsql
as $$
declare
  owner text;
begin
  select company_id into owner from assets where id = new.asset_id;
  if owner is null or owner <> new.company_id then
    raise exception 'inspection is outside the asset company';
  end if;
  return new;
end;
$$;

drop trigger if exists inspections_company on inspections;
create trigger inspections_company
  before insert or update on inspections
  for each row execute procedure inspections_same_company();

create or replace function files_same_company()
returns trigger
language plpgsql
as $$
declare
  owner text;
begin
  if new.asset_id is not null then
    select company_id into owner from assets where id = new.asset_id;
    if owner is null or owner <> new.company_id then
      raise exception 'file is outside the asset company';
    end if;
  end if;
  if new.inspection_id is not null then
    select company_id into owner from inspections where id = new.inspection_id;
    if owner is null or owner <> new.company_id then
      raise exception 'file is outside the inspection company';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists files_company on files;
create trigger files_company
  before insert or update on files
  for each row execute procedure files_same_company();

-- Company of the current account, when a non-owner role has set app.user_id.
-- security definer so the lookup does not recurse through RLS on users.
create or replace function app_company_id()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select company_id from users where id = current_setting('app.user_id', true)
$$;

alter table companies enable row level security;
alter table users enable row level security;
alter table assets enable row level security;
alter table inspections enable row level security;
alter table files enable row level security;

drop policy if exists companies_tenant on companies;
create policy companies_tenant on companies
  for all
  using (id = app_company_id())
  with check (id = app_company_id());

drop policy if exists users_tenant on users;
create policy users_tenant on users
  for all
  using (company_id = app_company_id())
  with check (company_id = app_company_id());

drop policy if exists assets_tenant on assets;
create policy assets_tenant on assets
  for all
  using (company_id = app_company_id())
  with check (company_id = app_company_id());

drop policy if exists inspections_tenant on inspections;
create policy inspections_tenant on inspections
  for all
  using (company_id = app_company_id())
  with check (company_id = app_company_id());

drop policy if exists files_tenant on files;
create policy files_tenant on files
  for all
  using (company_id = app_company_id())
  with check (company_id = app_company_id());
