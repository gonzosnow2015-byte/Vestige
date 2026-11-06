import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql, type Sql } from "@/lib/db";
import {
  assetInput,
  assetUpdateInput,
  inspectionInput,
  type AppEntry,
  type AssetDetail,
  type AssetRow,
  type AssetStatus,
  type FileRow,
  type ImportSummary,
  type InspectionResult,
  type InspectionRow,
  type InvitePreview,
  type InviteRow,
  type People,
  type PersonRow,
  type Role,
  type Workspace,
} from "@/lib/lift/types";
import {
  activeCompanyId,
  listMemberships,
  pickMembership,
  setActiveCompany,
  type Membership,
} from "@/lib/lift/membership.server";
import { scopedCompanyId } from "@/lib/lift/company-scope.server";

/**
 * Company boundary. Every handler below loads the caller's membership from
 * context.userId (authMiddleware) and scopes SQL by that company_id.
 * This is the enforcement that actually runs: the DB role is the table owner,
 * so the RLS policies in migrations/0002_lifttrack.sql do not apply to it.
 */

type MemberRow = {
  user_id: string;
  email: string;
  role: string;
  company_id: string;
  company_name: string;
};

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new Error(result.error.issues[0]?.message ?? "Invalid input");
  }
  return result.data;
}

function asRole(value: string): Role {
  if (value === "admin" || value === "inspector" || value === "viewer") return value;
  return "viewer";
}

function asStatus(value: string): AssetStatus {
  if (
    value === "in_service" ||
    value === "quarantine" ||
    value === "out_of_service" ||
    value === "scrapped"
  ) {
    return value;
  }
  return "in_service";
}

function asResult(value: string): InspectionResult {
  if (value === "pass" || value === "fail" || value === "conditional") return value;
  return "conditional";
}

function asDate(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function isUniqueViolation(error: unknown): boolean {
  if (typeof error === "object" && error !== null && "code" in error) {
    if ((error as { code?: string }).code === "23505") return true;
  }
  const message = error instanceof Error ? error.message : String(error);
  return /duplicate key|unique/i.test(message);
}

function toChoice(row: Membership) {
  return { id: row.company_id, name: row.company_name, role: row.role };
}

async function toWorkspace(sql: Sql, member: MemberRow): Promise<Workspace> {
  const rows = await listMemberships(sql, member.user_id);
  const companies = (rows.length > 0 ? rows : [{ ...member, role: asRole(member.role) }]).map(toChoice);
  return {
    company: { id: member.company_id, name: member.company_name },
    member: { id: member.user_id, email: member.email, role: asRole(member.role) },
    companies: companies.map((company) =>
      company.id === member.company_id ? { ...company, name: member.company_name } : company,
    ),
  };
}

async function loadMember(sql: Sql, userId: string): Promise<MemberRow | null> {
  const rows = await listMemberships(sql, userId);
  const requested = scopedCompanyId();
  const chosen = pickMembership(rows, requested || (await activeCompanyId(sql, userId)));
  if (!chosen) return null;
  return chosen;
}

async function requireMember(sql: Sql, userId: string): Promise<MemberRow> {
  const row = await loadMember(sql, userId);
  if (row) return row;
  const rows = await listMemberships(sql, userId);
  if (rows.length > 1) throw new Error("Choose a company first.");
  throw new Error("Create a company before using the register.");
}

function assertWrite(role: string) {
  if (role === "viewer") throw new Error("Viewers can look, not change the register.");
}

function assertAdmin(role: string) {
  if (role !== "admin") throw new Error("Only an admin can do that.");
}

function mapAsset(row: Record<string, unknown>): AssetRow {
  return {
    id: String(row.id),
    partNumber: String(row.part_number),
    type: String(row.type),
    description: String(row.description ?? ""),
    swl: row.swl == null ? null : String(row.swl),
    manufacturer: row.manufacturer == null ? null : String(row.manufacturer),
    serialNumber: row.serial_number == null ? null : String(row.serial_number),
    location: row.location == null ? null : String(row.location),
    status: asStatus(String(row.status)),
    nextDueDate: asDate(row.next_due_date),
    notes: row.notes == null ? null : String(row.notes),
    createdOn: asDate(row.created_on) ?? "",
    updatedOn: asDate(row.updated_on) ?? "",
  };
}

const assetColumns = `
  id, part_number, type, description, swl, manufacturer, serial_number,
  location, status, next_due_date, notes,
  created_at::date as created_on, updated_at::date as updated_on
`;

export const getWorkspace = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<Workspace | null> => {
    const sql = await getSql();
    const row = await loadMember(sql, context.userId);
    return row ? toWorkspace(sql, row) : null;
  });

export const createCompany = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    parse(
      z.object({
        name: z
          .string()
          .trim()
          .max(80)
          .optional()
          .transform((value) => value ?? ""),
      }),
      input,
    ),
  )
  .middleware([authMiddleware])
  .handler(async ({ context, data }): Promise<Workspace> => {
    const sql = await getSql();
    const email = await authEmail(sql, context.userId);
    const name = data.name.trim();

    async function openExisting(): Promise<Workspace | null> {
      const memberships = await listMemberships(sql, context.userId);
      const member = (await loadMember(sql, context.userId)) ?? memberships[0];
      if (!member) return null;
      await setActiveCompany(sql, context.userId, member.company_id);
      return toWorkspace(sql, member);
    }

    if (name.length >= 2) {
      const existing = await listMemberships(sql, context.userId);
      if (existing.length === 0) {
        const created = await sql<{ id: string }>`
          insert into companies (name) values (${name}) returning id
        `;
        const companyId = created[0]?.id;
        if (!companyId) throw new Error("Could not create the company.");
        try {
          await sql`
            insert into users (id, company_id, email, role)
            values (${context.userId}, ${companyId}, ${email}, 'admin')
          `;
        } catch (error) {
          await sql`
            delete from companies
            where id = ${companyId}
              and not exists (select 1 from users where company_id = ${companyId})
          `;
          const winner = await openExisting();
          if (winner) return winner;
          throw error;
        }
        await setActiveCompany(sql, context.userId, companyId);
      }
      const opened = await openExisting();
      if (!opened) throw new Error("Could not open the company.");
      return opened;
    }

    if (name.length > 0) throw new Error("Company name is too short.");

    await acceptPendingInvites(sql, context.userId, email);
    const opened = await openExisting();
    if (opened) return opened;
    throw new Error("Enter a company name to open a new register.");
  });

export const acceptInvite = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<Workspace | null> => {
    const sql = await getSql();
    const email = await authEmail(sql, context.userId);
    await acceptPendingInvites(sql, context.userId, email);
    const memberships = await listMemberships(sql, context.userId);
    const chosen = pickMembership(memberships, null);
    if (!chosen) return null;
    await setActiveCompany(sql, context.userId, chosen.company_id);
    return toWorkspace(sql, chosen);
  });

export const getJoinHint = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<{ email: string; googleOnly: boolean }> => {
    const sql = await getSql();
    const email = await authEmail(sql, context.userId);
    return { email, googleOnly: await isGoogleOnly(sql, context.userId) };
  });

const inviteEmail = z
  .string()
  .trim()
  .max(160)
  .transform((value) => value.toLowerCase())
  .refine((value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value), {
    message: "Use a real email address.",
  });

const inviteToken = z
  .string()
  .trim()
  .min(16, "That invite link is not valid.")
  .max(80, "That invite link is not valid.")
  .regex(/^[A-Za-z0-9_-]+$/, "That invite link is not valid.");

function newInviteToken(): string {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.getRandomValues) throw new Error("Could not create an invite link.");
  const bytes = new Uint8Array(24);
  cryptoApi.getRandomValues(bytes);
  let token = "";
  for (const byte of bytes) token += byte.toString(16).padStart(2, "0");
  return token;
}

export const lookupInvite = createServerFn({ method: "GET" })
  .validator((input: unknown) => parse(z.object({ token: inviteToken }), input))
  .handler(async ({ data }): Promise<InvitePreview | null> => {
    const sql = await getSql();
    const rows = await sql<{ email: string; role: string; company_name: string }>`
      select i.email, i.role, c.name as company_name
      from invites i
      join companies c on c.id = i.company_id
      where i.token = ${data.token} and i.accepted_at is null
    `;
    const row = rows[0];
    if (!row) return null;
    return { email: row.email, role: asRole(row.role), companyName: row.company_name };
  });

export const listPeople = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<People> => {
    const sql = await getSql();
    const member = await requireMember(sql, context.userId);
    assertAdmin(member.role);
    const members = await sql<{ id: string; email: string; name: string; role: string }>`
      select u.id, u.email, auth.name, u.role
      from users u
      join "user" auth on auth.id = u.id
      where u.company_id = ${member.company_id}
      order by u.created_at asc, u.email asc
    `;
    const invites = await sql<{ id: string; email: string; role: string; created_on: unknown; token: string | null }>`
      select id, email, role, created_at::date as created_on, token
      from invites
      where company_id = ${member.company_id} and accepted_at is null
      order by created_at asc, email asc
    `;
    const pending: InviteRow[] = [];
    for (const row of invites) {
      let token = row.token ?? "";
      if (!token) {
        token = newInviteToken();
        await sql`
          update invites set token = ${token}
          where id = ${row.id} and company_id = ${member.company_id} and token is null
        `;
      }
      pending.push({
        id: row.id,
        email: row.email,
        role: asRole(row.role),
        createdOn: asDate(row.created_on) ?? "",
        token,
      });
    }
    return {
      members: members.map(
        (row): PersonRow => ({
          id: row.id,
          email: row.email,
          name: row.name,
          role: asRole(row.role),
          self: row.id === member.user_id,
        }),
      ),
      invites: pending,
    };
  });

export const createInvite = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    parse(z.object({ email: inviteEmail, role: z.enum(["admin", "inspector", "viewer"]) }), input),
  )
  .middleware([authMiddleware])
  .handler(async ({ context, data }): Promise<{
    email: string;
    role: Role;
    updated: boolean;
    token: string;
    emailed: boolean;
    emailError: string | null;
  }> => {
    const sql = await getSql();
    const member = await requireMember(sql, context.userId);
    assertAdmin(member.role);

    const holders = await sql<{ company_id: string }>`
      select company_id from users where lower(email) = ${data.email}
    `;
    if (holders.some((row) => row.company_id === member.company_id)) {
      throw new Error("That email is already in this company.");
    }

    const pending = await sql<{ id: string; company_id: string }>`
      select id, company_id from invites
      where accepted_at is null and lower(email) = ${data.email} and company_id = ${member.company_id}
    `;
    const open = pending[0];

    let token = "";
    let updated = false;
    if (open) {
      const rows = await sql<{ token: string }>`
        update invites
        set role = ${data.role}, token = coalesce(token, ${newInviteToken()})
        where id = ${open.id} and company_id = ${member.company_id} and accepted_at is null
        returning token
      `;
      token = rows[0]?.token ?? "";
      if (!token) throw new Error("That invite is no longer pending.");
      updated = true;
    } else {
      try {
        const rows = await sql<{ token: string }>`
          insert into invites (company_id, email, role, invited_by, token)
          values (${member.company_id}, ${data.email}, ${data.role}, ${member.user_id}, ${newInviteToken()})
          returning token
        `;
        token = rows[0]?.token ?? "";
      } catch (error) {
        if (isUniqueViolation(error)) throw new Error("That email already has an invite.");
        throw error;
      }
      if (!token) throw new Error("Could not create an invite link.");
    }

    const { invitePageUrl, sendInviteEmail } = await import("./invite-mail.server");
    const mailed = await sendInviteEmail({
      to: data.email,
      companyName: member.company_name,
      role: data.role,
      link: invitePageUrl(token),
    });
    return { email: data.email, role: data.role, updated, token, ...mailed };
  });

export const revokeInvite = createServerFn({ method: "POST" })
  .validator((input: unknown) => parse(z.object({ id: z.string().trim().min(1).max(80) }), input))
  .middleware([authMiddleware])
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    const sql = await getSql();
    const member = await requireMember(sql, context.userId);
    assertAdmin(member.role);
    const removed = await sql<{ id: string }>`
      delete from invites
      where id = ${data.id} and company_id = ${member.company_id} and accepted_at is null
      returning id
    `;
    if (!removed[0]) throw new Error("That invite is no longer pending.");
    return { ok: true };
  });

export const setMemberRole = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    parse(
      z.object({
        userId: z.string().trim().min(1).max(80),
        role: z.enum(["admin", "inspector", "viewer"]),
      }),
      input,
    ),
  )
  .middleware([authMiddleware])
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    const sql = await getSql();
    const member = await requireMember(sql, context.userId);
    assertAdmin(member.role);
    if (data.userId === member.user_id) throw new Error("You cannot change your own role.");

    const target = await sql<{ role: string }>`
      select role from users where id = ${data.userId} and company_id = ${member.company_id}
    `;
    if (!target[0]) throw new Error("That person is not in this company.");
    if (target[0].role === "admin" && data.role !== "admin") {
      const counts = await sql<{ n: number }>`
        select count(*)::int as n from users
        where company_id = ${member.company_id} and role = 'admin'
      `;
      if ((counts[0]?.n ?? 0) < 2) throw new Error("The company needs at least one admin.");
    }
    await sql`
      update users set role = ${data.role}
      where id = ${data.userId} and company_id = ${member.company_id}
    `;
    return { ok: true };
  });

export const getAccountAccess = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<{ email: string; hasPassword: boolean }> => {
    const sql = await getSql();
    const email = await authEmail(sql, context.userId);
    const rows = await sql<{ provider: string; has_password: boolean }>`
      select "providerId" as provider, ("password" is not null) as has_password
      from account
      where "userId" = ${context.userId}
    `;
    return {
      email,
      hasPassword: rows.some((row) => row.provider === "credential" && row.has_password),
    };
  });

async function authEmail(sql: Sql, userId: string): Promise<string> {
  const authRows = await sql<{ email: string }>`
    select email from "user" where id = ${userId}
  `;
  const email = authRows[0]?.email?.trim().toLowerCase();
  if (!email) throw new Error("Account email is missing. Sign in again.");
  return email;
}

async function isGoogleOnly(sql: Sql, userId: string): Promise<boolean> {
  const rows = await sql<{ provider: string; has_password: boolean }>`
    select "providerId" as provider, ("password" is not null) as has_password
    from account
    where "userId" = ${userId}
  `;
  const google = rows.some((row) => row.provider === "grok-google" || row.provider === "google");
  const password = rows.some((row) => row.provider === "credential" && row.has_password);
  return google && !password;
}

async function acceptPendingInvites(sql: Sql, userId: string, email: string): Promise<void> {
  await sql.query(
    `with picked as (
       select i.id, i.company_id, i.role
       from invites i
       where i.accepted_at is null
         and lower(i.email) = lower($1)
         and not exists (
           select 1 from users u where u.id = $2 and u.company_id = i.company_id
         )
     ),
     joined as (
       insert into users (id, company_id, email, role)
       select $2, company_id, lower($1), role from picked
       on conflict (id, company_id) do nothing
       returning company_id
     )
     update invites i
     set accepted_at = now(), accepted_user_id = $2
     where i.accepted_at is null
       and lower(i.email) = lower($1)
       and (
         exists (select 1 from picked p where p.id = i.id)
         or exists (
           select 1 from users u where u.id = $2 and u.company_id = i.company_id
         )
       )`,
    [email, userId],
  );
}

async function acceptInviteToken(sql: Sql, userId: string, email: string, token: string): Promise<boolean> {
  if (!/^[A-Za-z0-9_-]{16,80}$/.test(token)) return false;
  const rows = await sql<{ company_id: string; role: string; email: string }>`
    select company_id, role, email from invites
    where token = ${token} and accepted_at is null
  `;
  const invite = rows[0];
  if (!invite || invite.email.trim().toLowerCase() !== email) return false;
  const existing = await sql<{ id: string }>`
    select id from users where id = ${userId} and company_id = ${invite.company_id}
  `;
  if (!existing[0]) {
    await sql`
      insert into users (id, company_id, email, role)
      values (${userId}, ${invite.company_id}, ${email}, ${invite.role})
      on conflict (id, company_id) do nothing
    `;
  }
  await sql`
    update invites
    set accepted_at = now(), accepted_user_id = ${userId}
    where token = ${token} and accepted_at is null
  `;
  return !existing[0];
}

export const enterApp = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    parse(
      z.object({
        token: z.string().trim().max(80).optional(),
        companyId: z.string().trim().max(80).optional(),
        join: z.boolean().optional(),
      }),
      input,
    ),
  )
  .middleware([authMiddleware])
  .handler(async ({ context, data }): Promise<AppEntry> => {
    const sql = await getSql();
    const email = await authEmail(sql, context.userId);
    const before = await listMemberships(sql, context.userId);
    const joining = data.join !== false;
    const joinedFromToken =
      joining && data.token ? await acceptInviteToken(sql, context.userId, email, data.token) : false;
    if (joining) await acceptPendingInvites(sql, context.userId, email);
    const memberships = await listMemberships(sql, context.userId);
    const companies = memberships.map(toChoice);
    if (memberships.length === 0) return { companies, workspace: null };
    const added = joinedFromToken || memberships.length > before.length;
    const stored = added ? null : data.companyId?.trim() || null;
    const chosen = pickMembership(memberships, stored);
    if (!chosen) return { companies, workspace: null };
    await setActiveCompany(sql, context.userId, chosen.company_id);
    return { companies, workspace: await toWorkspace(sql, chosen) };
  });

export const selectCompany = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    parse(z.object({ companyId: z.string().trim().min(1).max(80) }), input),
  )
  .middleware([authMiddleware])
  .handler(async ({ context, data }): Promise<Workspace> => {
    const sql = await getSql();
    const memberships = await listMemberships(sql, context.userId);
    const chosen = memberships.find((row) => row.company_id === data.companyId);
    if (!chosen) throw new Error("That company is not on this account.");
    await setActiveCompany(sql, context.userId, chosen.company_id);
    return toWorkspace(sql, chosen);
  });

export const renameCompany = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    parse(z.object({ name: z.string().trim().min(2, "Company name is too short").max(80) }), input),
  )
  .middleware([authMiddleware])
  .handler(async ({ context, data }): Promise<Workspace> => {
    const sql = await getSql();
    const member = await requireMember(sql, context.userId);
    assertAdmin(member.role);
    await sql`
      update companies set name = ${data.name} where id = ${member.company_id}
    `;
    return toWorkspace(sql, { ...member, company_name: data.name });
  });

export const deleteAccount = createServerFn({ method: "POST" })
  .validator(() => ({}))
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<{ ok: true }> => {
    const sql = await getSql();
    const memberships = await listMemberships(sql, context.userId);
    for (const membership of memberships) {
      const counts = await sql<{ others: number; other_admins: number }>`
        select
          count(*) filter (where id <> ${context.userId})::int as others,
          count(*) filter (where role = 'admin' and id <> ${context.userId})::int as other_admins
        from users
        where company_id = ${membership.company_id}
      `;
      const others = Number(counts[0]?.others ?? 0);
      const otherAdmins = Number(counts[0]?.other_admins ?? 0);
      if (others > 0 && otherAdmins === 0) {
        throw new Error(
          `You are the only admin of ${membership.company_name}. Make someone else an admin before deleting this account.`,
        );
      }
    }
    for (const membership of memberships) {
      const counts = await sql<{ others: number }>`
        select count(*) filter (where id <> ${context.userId})::int as others
        from users
        where company_id = ${membership.company_id}
      `;
      const others = Number(counts[0]?.others ?? 0);
      if (others > 0) {
        await sql`
          update invites
          set invited_by = (
            select id from users
            where company_id = ${membership.company_id}
              and role = 'admin'
              and id <> ${context.userId}
            limit 1
          )
          where invited_by = ${context.userId}
            and company_id = ${membership.company_id}
        `;
      } else {
        await sql`delete from companies where id = ${membership.company_id}`;
      }
    }
    await sql`delete from "user" where id = ${context.userId}`;
    return { ok: true };
  });

export const listAssets = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<AssetRow[]> => {
    const sql = await getSql();
    const member = await requireMember(sql, context.userId);
    const listed = await sql.query<Record<string, unknown>>(
      `select ${assetColumns}
       from assets
       where company_id = $1
       order by (next_due_date is null), next_due_date asc, part_number asc`,
      [member.company_id],
    );
    return listed.map(mapAsset);
  });

export const getAsset = createServerFn({ method: "POST" })
  .validator((input: unknown) => parse(z.object({ id: z.string().trim().min(1).max(80) }), input))
  .middleware([authMiddleware])
  .handler(async ({ context, data }): Promise<AssetDetail | null> => {
    const sql = await getSql();
    const member = await requireMember(sql, context.userId);
    const assets = await sql.query<Record<string, unknown>>(
      `select ${assetColumns} from assets where id = $1 and company_id = $2`,
      [data.id, member.company_id],
    );
    const assetRow = assets[0];
    if (!assetRow) return null;
    const inspections = await sql<{
      id: string;
      inspection_date: unknown;
      result: string;
      next_due_date: unknown;
      inspector_name: string;
      job_reference: string | null;
      notes: string | null;
    }>`
      select id, inspection_date, result, next_due_date, inspector_name, job_reference, notes
      from inspections
      where asset_id = ${data.id} and company_id = ${member.company_id}
      order by inspection_date desc, created_at desc
    `;
    const files = await sql<{
      id: string;
      inspection_id: string | null;
      file_name: string;
      mime_type: string;
      byte_size: number;
      uploaded_at: unknown;
      kind: string;
      caption: string | null;
    }>`
      select id, inspection_id, file_name,
             coalesce(mime_type, '') as mime_type,
             coalesce(byte_size, 0)::int as byte_size,
             uploaded_at::date as uploaded_at,
             coalesce(kind, 'certificate') as kind,
             caption
      from files
      where asset_id = ${data.id} and company_id = ${member.company_id}
      order by uploaded_at desc, file_name asc
    `;
    const inspectionRows: InspectionRow[] = inspections.map((row) => ({
      id: row.id,
      inspectionDate: asDate(row.inspection_date) ?? "",
      result: asResult(row.result),
      nextDueDate: asDate(row.next_due_date),
      inspectorName: row.inspector_name,
      jobReference: row.job_reference,
      notes: row.notes,
    }));
    const fileRows: FileRow[] = files.map((row) => ({
      id: row.id,
      inspectionId: row.inspection_id,
      fileName: row.file_name,
      mimeType: row.mime_type,
      byteSize: Number(row.byte_size) || 0,
      uploadedOn: asDate(row.uploaded_at) ?? "",
      kind: row.kind === "asset" || row.kind === "inspection" ? row.kind : "certificate",
      caption: row.caption,
    }));
    return { asset: mapAsset(assetRow), inspections: inspectionRows, files: fileRows };
  });

async function writeAsset(
  sql: Sql,
  companyId: string,
  input: z.infer<typeof assetInput>,
  id?: string,
): Promise<AssetRow> {
  try {
    const rows = id
      ? await sql.query<Record<string, unknown>>(
          `update assets set
             part_number = $3,
             type = $4,
             description = $5,
             swl = $6,
             manufacturer = $7,
             serial_number = $8,
             location = $9,
             status = $10,
             next_due_date = $11::date,
             notes = $12
           where id = $1 and company_id = $2
           returning ${assetColumns}`,
          [
            id,
            companyId,
            input.partNumber,
            input.type,
            input.description,
            input.swl,
            input.manufacturer,
            input.serialNumber,
            input.location,
            input.status,
            input.nextDueDate,
            input.notes,
          ],
        )
      : await sql.query<Record<string, unknown>>(
          `insert into assets (
             company_id, part_number, type, description, swl, manufacturer,
             serial_number, location, status, next_due_date, notes
           ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::date,$11)
           returning ${assetColumns}`,
          [
            companyId,
            input.partNumber,
            input.type,
            input.description,
            input.swl,
            input.manufacturer,
            input.serialNumber,
            input.location,
            input.status,
            input.nextDueDate,
            input.notes,
          ],
        );
    const row = rows[0];
    if (!row) throw new Error("That asset is not in your company.");
    return mapAsset(row);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new Error("That part number is already in this company.");
    }
    throw error;
  }
}

export const createAsset = createServerFn({ method: "POST" })
  .validator((input: unknown) => parse(assetInput, input))
  .middleware([authMiddleware])
  .handler(async ({ context, data }): Promise<AssetRow> => {
    const sql = await getSql();
    const member = await requireMember(sql, context.userId);
    assertWrite(member.role);
    return writeAsset(sql, member.company_id, data);
  });

const importedAsset = z.object({
  partNumber: z.string().trim().min(1).max(64),
  type: z.string().trim().min(1, "Title is required").max(80),
  description: z.string().max(500),
  swl: z.string().max(40).nullable(),
  manufacturer: z.string().max(120).nullable(),
  serialNumber: z.string().max(120).nullable(),
  location: z.string().max(120).nullable(),
  status: z.enum(["in_service", "quarantine", "out_of_service", "scrapped"]),
  nextDueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  notes: z.string().max(2000).nullable(),
});

export const importAssets = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    parse(
      z.object({
        mode: z.enum(["skip", "update"]),
        rows: z.array(importedAsset).max(500, "Import up to 500 rows at a time."),
      }),
      input,
    ),
  )
  .middleware([authMiddleware])
  .handler(async ({ context, data }): Promise<ImportSummary> => {
    const sql = await getSql();
    const member = await requireMember(sql, context.userId);
    assertAdmin(member.role);

    const existing = await sql<{ id: string; part: string }>`
      select id, lower(part_number) as part
      from assets
      where company_id = ${member.company_id}
    `;
    const byPart = new Map(existing.map((row) => [row.part, row.id]));
    const seen = new Set<string>();
    const summary: ImportSummary = { created: 0, updated: 0, skipped: 0, failed: [] };

    for (const row of data.rows) {
      const key = row.partNumber.toLowerCase();
      if (seen.has(key)) {
        summary.failed.push({ partNumber: row.partNumber, message: "This part number is already on an earlier row." });
        continue;
      }
      seen.add(key);
      const id = byPart.get(key);
      if (id && data.mode === "skip") {
        summary.skipped += 1;
        continue;
      }
      try {
        if (id) {
          await writeAsset(sql, member.company_id, row, id);
          summary.updated += 1;
        } else {
          const created = await writeAsset(sql, member.company_id, row);
          byPart.set(key, created.id);
          summary.created += 1;
        }
      } catch (error) {
        summary.failed.push({
          partNumber: row.partNumber,
          message: error instanceof Error ? error.message : "Could not save that row.",
        });
      }
    }
    return summary;
  });

export const updateAsset = createServerFn({ method: "POST" })
  .validator((input: unknown) => parse(assetUpdateInput, input))
  .middleware([authMiddleware])
  .handler(async ({ context, data }): Promise<AssetRow> => {
    const sql = await getSql();
    const member = await requireMember(sql, context.userId);
    assertWrite(member.role);
    const { id, ...rest } = data;
    return writeAsset(sql, member.company_id, rest, id);
  });

export const deleteAsset = createServerFn({ method: "POST" })
  .validator((input: unknown) => parse(z.object({ id: z.string().trim().min(1).max(80) }), input))
  .middleware([authMiddleware])
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    const sql = await getSql();
    const member = await requireMember(sql, context.userId);
    assertAdmin(member.role);
    const removed = await sql<{ id: string }>`
      delete from assets
      where id = ${data.id} and company_id = ${member.company_id}
      returning id
    `;
    if (!removed[0]) throw new Error("That asset is not in your company.");
    return { ok: true };
  });

export const recordInspection = createServerFn({ method: "POST" })
  .validator((input: unknown) => parse(inspectionInput, input))
  .middleware([authMiddleware])
  .handler(async ({ context, data }): Promise<{ id: string; assetStatus: AssetStatus; assetNextDue: string | null }> => {
    const sql = await getSql();
    const member = await requireMember(sql, context.userId);
    assertWrite(member.role);
    if ((data.result === "pass" || data.result === "conditional") && !data.nextDueDate) {
      throw new Error("Set the next due date.");
    }
    const rows = await sql<{ id: string; status: string; next_due_date: unknown }>`
      with ins as (
        insert into inspections (
          company_id, asset_id, inspection_date, result, next_due_date,
          inspector_name, job_reference, notes
        ) values (
          ${member.company_id},
          ${data.assetId},
          ${data.inspectionDate}::date,
          ${data.result},
          ${data.nextDueDate}::date,
          ${data.inspectorName},
          ${data.jobReference},
          ${data.notes}
        )
        returning id
      ),
      upd as (
        update assets
        set next_due_date = coalesce(${data.nextDueDate}::date, next_due_date),
            status = ${data.assetStatus}
        where id = ${data.assetId} and company_id = ${member.company_id}
        returning id, status, next_due_date
      )
      select ins.id, upd.status, upd.next_due_date from ins join upd on true
    `;
    const row = rows[0];
    if (!row) throw new Error("That asset is not in your company.");
    return {
      id: row.id,
      assetStatus: asStatus(String(row.status)),
      assetNextDue: asDate(row.next_due_date),
    };
  });
