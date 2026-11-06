-- Shareable invite tokens. Acceptance is still the invited email (letter case
-- ignored). The token is only the link an admin can copy or email.

alter table invites add column if not exists token text;

update invites
set token = replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
where token is null;

create unique index if not exists invites_token_uidx
  on invites (token)
  where token is not null;
