-- Asset photo (one per asset) and inspection wear photos (many, optional caption).
-- Existing rows stay certificates. Company scope is still the company_id filter
-- in the file handlers; the policy below is the contract for a non-owner role.

alter table files add column if not exists kind text not null default 'certificate';
alter table files add column if not exists caption text;

alter table files drop constraint if exists files_kind_check;
alter table files add constraint files_kind_check
  check (kind in ('certificate', 'asset', 'inspection'));

create unique index if not exists files_one_asset_photo_uidx
  on files (asset_id)
  where kind = 'asset';
