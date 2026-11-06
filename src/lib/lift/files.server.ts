import { getSql } from "@/lib/db";
import { assertSameSiteRequest, CrossSiteRequestError } from "@/lib/auth/isolation.server";
import { requireUserId, UnauthorizedError } from "@/lib/auth/verify.server";
import { displayFileName, isImageMime, MAX_FILE_BYTES, MAX_IMAGE_BYTES, sniffFile, type CertMime } from "@/lib/lift/file-kind";
import { listMemberships, activeCompanyId, pickMembership } from "@/lib/lift/membership.server";

const KNOWN = new Set([
  "Create a company before using the register.",
  "Choose a company first.",
  "Viewers can look, not change the register.",
  "That asset is not in your company.",
  "That inspection does not belong to this asset.",
  "That file is not in your company.",
  "Choose a PDF or an image (JPEG, PNG, or WebP).",
  "Choose a JPEG, PNG, or WebP photo.",
  "Keep certificates under 4 MB.",
  "Keep photos under 8 MB.",
  "This inspection already has 12 photos.",
  "Choose a file to upload.",
  "That file is empty.",
  "Upload this document again. The earlier entry has no file.",
]);

function bearerFrom(request: Request): string | undefined {
  const header = request.headers.get("authorization");
  if (!header) return undefined;
  const match = /^Bearer\s+(\S+)/i.exec(header);
  return match?.[1];
}

function toErrorResponse(error: unknown): Response {
  if (error instanceof UnauthorizedError) {
    return Response.json({ error: "Sign in again." }, { status: 401 });
  }
  if (error instanceof CrossSiteRequestError) {
    return Response.json({ error: "That request was blocked." }, { status: 403 });
  }
  const message = error instanceof Error ? error.message : "";
  if (KNOWN.has(message)) {
    const status = message.startsWith("Viewers")
      ? 403
      : /not in your company|does not belong|no file/.test(message)
        ? 404
        : 400;
    return Response.json({ error: message }, { status });
  }
  console.error("[files]", error);
  return Response.json({ error: "Could not handle that file." }, { status: 500 });
}

async function caller(request: Request) {
  assertSameSiteRequest();
  const userId = await requireUserId(bearerFrom(request));
  const sql = await getSql();
  const rows = await listMemberships(sql, userId);
  const header = request.headers.get("x-vestige-company")?.trim() ?? "";
  const requested = header.length > 0 && header.length <= 80 ? header : null;
  const chosen = pickMembership(rows, requested || (await activeCompanyId(sql, userId)));
  if (!chosen && rows.length > 1) throw new Error("Choose a company first.");
  return { sql, member: chosen };
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}

function asBytes(value: unknown): Uint8Array | null {
  if (value == null) return null;
  if (value instanceof Uint8Array) return new Uint8Array(value);
  if (typeof value === "string" && value.startsWith("\\x")) {
    const hex = value.slice(2);
    if (hex.length % 2 !== 0 || !/^[0-9a-f]*$/i.test(hex)) return null;
    const out = new Uint8Array(hex.length / 2);
    for (let index = 0; index < out.length; index += 1) {
      out[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
    }
    return out;
  }
  return null;
}

function contentDisposition(fileName: string): string {
  const ascii = fileName.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "");
  const star = encodeURIComponent(fileName).replace(/[!'()*]/g, (char) =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `inline; filename="${ascii}"; filename*=UTF-8''${star}`;
}

const idPattern = /^[0-9a-f-]{1,80}$/i;

export async function uploadCompanyFile(request: Request): Promise<Response> {
  try {
    const { sql, member } = await caller(request);
    if (!member) throw new Error("Create a company before using the register.");
    if (member.role === "viewer") throw new Error("Viewers can look, not change the register.");

    const form = await request.formData();
    const assetId = String(form.get("assetId") ?? "").trim();
    const inspectionRaw = String(form.get("inspectionId") ?? "").trim();
    let inspectionId = inspectionRaw === "" ? null : inspectionRaw;
    const kindRaw = String(form.get("kind") ?? "certificate").trim();
    const kind = kindRaw === "asset" || kindRaw === "inspection" ? kindRaw : "certificate";
    let captionRaw = "";
    for (const char of String(form.get("caption") ?? "")) {
      if (char.charCodeAt(0) >= 32) captionRaw += char;
    }
    captionRaw = captionRaw.trim();
    const caption = captionRaw === "" ? null : captionRaw.slice(0, 140);
    const file = form.get("file");
    if (!idPattern.test(assetId)) throw new Error("That asset is not in your company.");
    if (inspectionId && !idPattern.test(inspectionId)) {
      throw new Error("That inspection does not belong to this asset.");
    }
    if (kind === "asset") inspectionId = null;
    if (kind === "inspection" && !inspectionId) {
      throw new Error("That inspection does not belong to this asset.");
    }
    if (!(file instanceof File)) throw new Error("Choose a file to upload.");
    const limit = kind === "certificate" ? MAX_FILE_BYTES : MAX_IMAGE_BYTES;
    const tooBig = kind === "certificate" ? "Keep certificates under 4 MB." : "Keep photos under 8 MB.";
    if (file.size > limit) throw new Error(tooBig);

    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.byteLength === 0) throw new Error("That file is empty.");
    if (bytes.byteLength > limit) throw new Error(tooBig);
    const mime = sniffFile(bytes);
    if (kind === "certificate") {
      if (!mime) throw new Error("Choose a PDF or an image (JPEG, PNG, or WebP).");
    } else if (!isImageMime(mime)) {
      throw new Error("Choose a JPEG, PNG, or WebP photo.");
    }
    if (!mime) throw new Error("Choose a JPEG, PNG, or WebP photo.");

    const asset = await sql<{ id: string }>`
      select id from assets where id = ${assetId} and company_id = ${member.company_id}
    `;
    if (!asset[0]) throw new Error("That asset is not in your company.");
    if (inspectionId) {
      const inspection = await sql<{ id: string }>`
        select id from inspections
        where id = ${inspectionId}
          and asset_id = ${assetId}
          and company_id = ${member.company_id}
      `;
      if (!inspection[0]) throw new Error("That inspection does not belong to this asset.");
      if (kind === "inspection") {
        const counts = await sql<{ n: number }>`
          select count(*)::int as n from files
          where inspection_id = ${inspectionId}
            and company_id = ${member.company_id}
            and kind = 'inspection'
        `;
        if ((counts[0]?.n ?? 0) >= 12) throw new Error("This inspection already has 12 photos.");
      }
    }

    if (kind === "asset") {
      await sql`
        delete from files
        where company_id = ${member.company_id}
          and asset_id = ${assetId}
          and kind = 'asset'
      `;
    }

    const id = crypto.randomUUID();
    const fileName = displayFileName(file.name, mime, kind === "certificate" ? "certificate" : "photo");
    const filePath = `${member.company_id}/${assetId}/${id}/${fileName}`;
    const rows = await sql.query<{
      id: string;
      inspection_id: string | null;
      file_name: string;
      mime_type: string;
      byte_size: number;
    }>(
      `insert into files (
         id, company_id, inspection_id, asset_id, file_path, file_name, mime_type, byte_size, content, kind, caption
       ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       returning id, inspection_id, file_name, mime_type, byte_size`,
      [id, member.company_id, inspectionId, assetId, filePath, fileName, mime, bytes.byteLength, bytes, kind, caption],
    );
    const row = rows[0];
    if (!row) throw new Error("Could not handle that file.");
    return Response.json({
      id: row.id,
      inspectionId: row.inspection_id,
      fileName: row.file_name,
      mimeType: row.mime_type,
      byteSize: row.byte_size,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function downloadCompanyFile(request: Request, fileId: string): Promise<Response> {
  try {
    if (!idPattern.test(fileId)) throw new Error("That file is not in your company.");
    const { sql, member } = await caller(request);
    if (!member) throw new Error("Create a company before using the register.");
    const rows = await sql<{ file_name: string; content: unknown }>`
      select file_name, content
      from files
      where id = ${fileId} and company_id = ${member.company_id}
    `;
    const row = rows[0];
    if (!row) throw new Error("That file is not in your company.");
    const bytes = asBytes(row.content);
    if (!bytes || bytes.byteLength === 0) {
      throw new Error("Upload this document again. The earlier entry has no file.");
    }
    const mime: CertMime | null = sniffFile(bytes);
    if (!mime) throw new Error("Choose a PDF or an image (JPEG, PNG, or WebP).");
    return new Response(toArrayBuffer(bytes), {
      status: 200,
      headers: {
        "Content-Type": mime,
        "Content-Length": String(bytes.byteLength),
        "Content-Disposition": contentDisposition(row.file_name),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function deleteCompanyFile(request: Request, fileId: string): Promise<Response> {
  try {
    if (!idPattern.test(fileId)) throw new Error("That file is not in your company.");
    const { sql, member } = await caller(request);
    if (!member) throw new Error("Create a company before using the register.");
    if (member.role === "viewer") throw new Error("Viewers can look, not change the register.");
    const removed = await sql<{ id: string }>`
      delete from files
      where id = ${fileId} and company_id = ${member.company_id}
      returning id
    `;
    if (!removed[0]) throw new Error("That file is not in your company.");
    return Response.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
