import { useEffect, useState, type FormEvent } from "react";
import { Field } from "@/components/field";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { FILE_ACCEPT } from "@/lib/lift/file-kind";
import { uploadCompanyFile } from "@/lib/lift/files-client";

export function CertUpload({
  assetId,
  inspections,
  defaultInspectionId,
  onUploaded,
}: {
  assetId: string;
  inspections: { id: string; label: string }[];
  defaultInspectionId?: string | null;
  onUploaded: () => void;
}) {
  const [inspectionId, setInspectionId] = useState(defaultInspectionId ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [inputKey, setInputKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (defaultInspectionId) setInspectionId(defaultInspectionId);
  }, [defaultInspectionId]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!file) {
      setError("Choose a file to upload.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      await uploadCompanyFile({ assetId, inspectionId, file });
      setFile(null);
      setInspectionId("");
      setInputKey((value) => value + 1);
      setPending(false);
      onUploaded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload that file.");
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-3">
      <Field label="File" hint="PDF certificate or a JPEG, PNG, or WebP photo. 4 MB max.">
        <input
          key={inputKey}
          type="file"
          required
          accept={FILE_ACCEPT}
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          className="block w-full text-sm text-ink file:mr-3 file:min-h-11 file:cursor-pointer file:rounded-control file:border-0 file:bg-inset file:px-3 file:text-sm file:font-medium file:text-ink"
        />
      </Field>
      <Field label="Attach to">
        <Select value={inspectionId} onChange={(event) => setInspectionId(event.target.value)}>
          <option value="">This asset</option>
          {inspections.map((row) => (
            <option key={row.id} value={row.id}>
              {row.label}
            </option>
          ))}
        </Select>
      </Field>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Uploading…" : "Upload"}
      </Button>
    </form>
  );
}
