export const MAX_FILE_BYTES = 4 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export const FILE_ACCEPT =
  "application/pdf,image/jpeg,image/png,image/webp,.pdf,.jpg,.jpeg,.png,.webp";

export const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp";

export type CertMime = "application/pdf" | "image/jpeg" | "image/png" | "image/webp";
export type ImageMime = Exclude<CertMime, "application/pdf">;

const PDF = [0x25, 0x50, 0x44, 0x46, 0x2d];
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  if (bytes.length < signature.length) return false;
  return signature.every((value, index) => bytes[index] === value);
}

/** Trust the bytes, not the browser-reported type. */
export function sniffFile(bytes: Uint8Array): CertMime | null {
  if (startsWith(bytes, PDF)) return "application/pdf";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (startsWith(bytes, PNG)) return "image/png";
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

export function extensionFor(mime: CertMime): string {
  if (mime === "application/pdf") return ".pdf";
  if (mime === "image/jpeg") return ".jpg";
  if (mime === "image/png") return ".png";
  return ".webp";
}

export function isImageMime(mime: CertMime | null): mime is ImageMime {
  return mime === "image/jpeg" || mime === "image/png" || mime === "image/webp";
}

function withoutControls(value: string): string {
  let out = "";
  for (const char of value) {
    if (char.charCodeAt(0) >= 32) out += char;
  }
  return out;
}

export function displayFileName(raw: string, mime: CertMime, fallback = "certificate"): string {
  const base = withoutControls(raw.split(/[/\\]/).pop() ?? fallback)
    .trim()
    .replace(/^\.+/, "");
  const cleaned = (base || fallback).slice(0, 160);
  const ext = extensionFor(mime);
  if (cleaned.toLowerCase().endsWith(ext)) return cleaned.slice(0, 180);
  const stem = cleaned.replace(/\.[a-z0-9]{1,8}$/i, "") || fallback;
  return `${stem}${ext}`.slice(0, 180);
}

export function fileKindLabel(mime: string): string {
  if (mime === "application/pdf") return "Certificate";
  if (mime.startsWith("image/")) return "Photo";
  return "Document";
}
