import { getBearerToken } from "@/lib/auth/client";
import { rememberedCompany } from "@/lib/lift/active-company";
import { MAX_FILE_BYTES, MAX_IMAGE_BYTES } from "@/lib/lift/file-kind";
import { previewPathPrefix } from "@/lib/preview-path-prefix";

function companyFileUrl(path: string): string {
  if (typeof window === "undefined") return path;
  const prefix = previewPathPrefix(window.location.hostname, window.location.pathname);
  return `${prefix ?? ""}${path}`;
}

function authHeaders(): Headers {
  const headers = new Headers();
  const token = getBearerToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const companyId = rememberedCompany();
  if (companyId) headers.set("x-vestige-company", companyId);
  return headers;
}

async function errorMessage(response: Response, fallback: string): Promise<string> {
  if (response.status === 413) return "That file is too large.";
  const text = await response.text();
  try {
    const payload = JSON.parse(text) as { error?: string };
    if (payload.error) return payload.error;
  } catch {
    /* not json */
  }
  return fallback;
}

export type UploadedFile = {
  id: string;
  inspectionId: string | null;
  fileName: string;
  mimeType: string;
  byteSize: number;
};

export async function uploadCompanyFile(input: {
  assetId: string;
  inspectionId?: string | null;
  file: File;
  kind?: "certificate" | "asset" | "inspection";
  caption?: string;
}): Promise<UploadedFile> {
  const kind = input.kind ?? "certificate";
  const limit = kind === "certificate" ? MAX_FILE_BYTES : MAX_IMAGE_BYTES;
  if (input.file.size > limit) {
    throw new Error(kind === "certificate" ? "Keep certificates under 4 MB." : "Keep photos under 8 MB.");
  }
  const body = new FormData();
  body.set("assetId", input.assetId);
  if (input.inspectionId) body.set("inspectionId", input.inspectionId);
  body.set("kind", kind);
  if (input.caption?.trim()) body.set("caption", input.caption.trim());
  body.set("file", input.file);
  const response = await fetch(companyFileUrl("/api/files"), {
    method: "POST",
    body,
    headers: authHeaders(),
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error(await errorMessage(response, "Could not upload that file."));
  }
  const payload = (await response.json()) as Partial<UploadedFile>;
  if (!payload.id || !payload.fileName) {
    throw new Error("Could not upload that file.");
  }
  return {
    id: payload.id,
    inspectionId: payload.inspectionId ?? (input.inspectionId || null),
    fileName: payload.fileName,
    mimeType: payload.mimeType || input.file.type || "",
    byteSize: typeof payload.byteSize === "number" ? payload.byteSize : input.file.size,
  };
}

export async function deleteCompanyFile(id: string): Promise<void> {
  const response = await fetch(companyFileUrl(`/api/files/${encodeURIComponent(id)}`), {
    method: "DELETE",
    headers: authHeaders(),
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error(await errorMessage(response, "Could not remove that file."));
  }
}

export async function fetchCompanyFile(id: string): Promise<{ url: string; mime: string }> {
  const response = await fetch(companyFileUrl(`/api/files/${encodeURIComponent(id)}`), {
    headers: authHeaders(),
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error(await errorMessage(response, "Could not open that file."));
  }
  const mime = response.headers.get("content-type")?.split(";")[0]?.trim() || "application/octet-stream";
  const blob = await response.blob();
  const typed = new Blob([blob], { type: mime });
  return { url: URL.createObjectURL(typed), mime };
}