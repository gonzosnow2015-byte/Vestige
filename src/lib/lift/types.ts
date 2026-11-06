import { z } from "zod";

export const ROLES = ["admin", "inspector", "viewer"] as const;
export type Role = (typeof ROLES)[number];

export const ASSET_STATUSES = [
  "in_service",
  "quarantine",
  "out_of_service",
  "scrapped",
] as const;
export type AssetStatus = (typeof ASSET_STATUSES)[number];

export const INSPECTION_RESULTS = ["pass", "fail", "conditional"] as const;
export type InspectionResult = (typeof INSPECTION_RESULTS)[number];

export const STATUS_LABEL: Record<AssetStatus, string> = {
  in_service: "In service",
  quarantine: "Quarantine",
  out_of_service: "Out of service",
  scrapped: "Scrapped",
};

export const RESULT_LABEL: Record<InspectionResult, string> = {
  pass: "Pass",
  fail: "Fail",
  conditional: "Conditional",
};

export const ROLE_LABEL: Record<Role, string> = {
  admin: "Admin",
  inspector: "Inspector",
  viewer: "Viewer",
};

const emptyToNull = (value: string) => {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
};

const optionalText = (max: number) =>
  z.string().max(max).transform(emptyToNull);

const optionalDate = z
  .string()
  .transform(emptyToNull)
  .refine((value) => value === null || /^\d{4}-\d{2}-\d{2}$/.test(value), {
    message: "Use a real date",
  });

export const assetInput = z.object({
  partNumber: z.string().trim().min(1, "Part number is required").max(64),
  type: z.string().trim().min(1, "Title is required").max(80),
  description: z.string().trim().max(500),
  swl: optionalText(40),
  manufacturer: optionalText(120),
  serialNumber: optionalText(120),
  location: optionalText(120),
  status: z.enum(ASSET_STATUSES),
  nextDueDate: optionalDate,
  notes: optionalText(2000),
});

export type AssetInput = z.infer<typeof assetInput>;

export type ImportSummary = {
  created: number;
  updated: number;
  skipped: number;
  failed: { partNumber: string; message: string }[];
};

export const assetUpdateInput = assetInput.extend({
  id: z.string().trim().min(1).max(80),
});

export const inspectionInput = z.object({
  assetId: z.string().trim().min(1).max(80),
  inspectionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a real date"),
  result: z.enum(INSPECTION_RESULTS),
  nextDueDate: optionalDate,
  inspectorName: z.string().trim().min(1, "Inspector name is required").max(120),
  jobReference: optionalText(80),
  notes: optionalText(2000),
  assetStatus: z.enum(ASSET_STATUSES),
});

export type CompanyChoice = {
  id: string;
  name: string;
  role: Role;
};

export type Workspace = {
  company: { id: string; name: string };
  member: { id: string; email: string; role: Role };
  companies: CompanyChoice[];
};

export type AppEntry = {
  companies: CompanyChoice[];
  workspace: Workspace | null;
};

export type PersonRow = {
  id: string;
  email: string;
  name: string;
  role: Role;
  self: boolean;
};

export type InviteRow = {
  id: string;
  email: string;
  role: Role;
  createdOn: string;
  token: string;
};

export type InvitePreview = {
  email: string;
  role: Role;
  companyName: string;
};

export type People = {
  members: PersonRow[];
  invites: InviteRow[];
};

export type AssetRow = {
  id: string;
  partNumber: string;
  type: string;
  description: string;
  swl: string | null;
  manufacturer: string | null;
  serialNumber: string | null;
  location: string | null;
  status: AssetStatus;
  nextDueDate: string | null;
  notes: string | null;
  createdOn: string;
  updatedOn: string;
};

export type InspectionRow = {
  id: string;
  inspectionDate: string;
  result: InspectionResult;
  nextDueDate: string | null;
  inspectorName: string;
  jobReference: string | null;
  notes: string | null;
};

export type FileKind = "certificate" | "asset" | "inspection";

export type FileRow = {
  id: string;
  inspectionId: string | null;
  fileName: string;
  mimeType: string;
  byteSize: number;
  uploadedOn: string;
  kind: FileKind;
  caption: string | null;
};

export type AssetDetail = {
  asset: AssetRow;
  inspections: InspectionRow[];
  files: FileRow[];
};
