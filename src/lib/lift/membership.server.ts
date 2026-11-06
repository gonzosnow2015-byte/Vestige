import type { Sql } from "@/lib/db";
import type { Role } from "@/lib/lift/types";

export type Membership = {
  user_id: string;
  email: string;
  role: Role;
  company_id: string;
  company_name: string;
};

function asRole(value: string): Role {
  if (value === "admin" || value === "inspector" || value === "viewer") return value;
  return "viewer";
}

export function pickMembership<T extends { company_id: string }>(
  rows: T[],
  companyId: string | null,
): T | null {
  if (rows.length === 0) return null;
  if (companyId) {
    const match = rows.find((row) => row.company_id === companyId);
    if (match) return match;
  }
  if (rows.length === 1) return rows[0] ?? null;
  return null;
}

export async function listMemberships(sql: Sql, userId: string): Promise<Membership[]> {
  const rows = await sql.query<{
    user_id: string;
    email: string;
    role: string;
    company_id: string;
    company_name: string;
  }>(
    `select u.id as user_id, u.email, u.role, u.company_id, c.name as company_name
     from users u
     join companies c on c.id = u.company_id
     where u.id = $1
     order by c.name asc, u.created_at asc`,
    [userId],
  );
  return rows.map((row) => ({ ...row, role: asRole(row.role) }));
}

export async function activeCompanyId(sql: Sql, userId: string): Promise<string | null> {
  const rows = await sql<{ company_id: string }>`
    select company_id from active_company where user_id = ${userId}
  `;
  return rows[0]?.company_id ?? null;
}

export async function setActiveCompany(sql: Sql, userId: string, companyId: string): Promise<void> {
  await sql`
    insert into active_company (user_id, company_id)
    values (${userId}, ${companyId})
    on conflict (user_id) do update set company_id = excluded.company_id
  `;
}
