-- A person can belong to more than one company, with a separate role in each.
-- The active company is the register every request reads and writes.

alter table users drop constraint if exists users_pkey;
alter table users add constraint users_pkey primary key (id, company_id);

create table if not exists active_company (
  user_id text primary key references "user" (id) on delete cascade,
  company_id text not null references companies (id) on delete cascade
);

-- One open invite per company per address. The same address may be invited elsewhere.
drop index if exists invites_pending_email_uidx;
create unique index if not exists invites_pending_company_email_uidx
  on invites (company_id, lower(email))
  where accepted_at is null;

create or replace function app_company_id()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select a.company_id
      from active_company a
      join users u on u.id = a.user_id and u.company_id = a.company_id
      where a.user_id = current_setting('app.user_id', true)
    ),
    (
      select u.company_id
      from users u
      where u.id = current_setting('app.user_id', true)
      order by u.created_at asc
      limit 1
    )
  )
$$;
