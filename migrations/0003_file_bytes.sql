-- Certificate PDFs and inspection photos. Bytes live on the row so the
-- deployed app does not need a writable disk. Company scope is the same
-- contract as 0002: files_tenant (RLS on a non-owner role) and, because the
-- app connects as the table owner, an explicit company_id filter on every
-- read and write in src/lib/lift/files.server.ts.

alter table files add column if not exists mime_type text;
alter table files add column if not exists byte_size integer;
alter table files add column if not exists content bytea;
