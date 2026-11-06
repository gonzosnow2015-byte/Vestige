import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { AssetForm, type AssetFormValues } from "@/components/asset-form";
import { AssetHistory } from "@/components/asset-history";
import { CertUpload } from "@/components/cert-upload";
import { AssetBadge } from "@/components/status-pill";
import { Field } from "@/components/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import { formatDate, suggestStatus, todayISO, addMonthsISO } from "@/lib/lift/format";
import { FILE_ACCEPT, IMAGE_ACCEPT, MAX_IMAGE_BYTES } from "@/lib/lift/file-kind";
import { deleteCompanyFile, fetchCompanyFile, uploadCompanyFile } from "@/lib/lift/files-client";
import { deleteAsset, getAsset, recordInspection, updateAsset } from "@/lib/lift/server";
import {
  ASSET_STATUSES,
  INSPECTION_RESULTS,
  RESULT_LABEL,
  STATUS_LABEL,
  type AssetDetail,
  type AssetStatus,
  type FileRow,
  type InspectionResult,
  type InspectionRow,
} from "@/lib/lift/types";
import { useWorkspace } from "@/lib/lift/workspace";

export const Route = createFileRoute("/app/assets/$assetId")({
  component: AssetPage,
});

function AssetPage() {
  const { assetId } = Route.useParams();
  const navigate = useNavigate();
  const workspace = useWorkspace();
  const user = useCurrentUser();
  const canWrite = workspace.member.role !== "viewer";
  const isAdmin = workspace.member.role === "admin";
  const [detail, setDetail] = useState<AssetDetail | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [freshId, setFreshId] = useState<string | null>(null);
  const [certTarget, setCertTarget] = useState<string | null>(null);

  function reload() {
    return getAsset({ data: { id: assetId } })
      .then(setDetail)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Could not load the asset.");
        setDetail(null);
      });
  }

  useEffect(() => {
    setEditing(false);
    setConfirmDelete(false);
    setError(null);
    setFreshId(null);
    setCertTarget(null);
    void reload();
  }, [assetId, workspace.company.id]);

  useEffect(() => {
    if (!freshId) return;
    document.getElementById(`inspection-${freshId}`)?.scrollIntoView({ block: "nearest" });
  }, [freshId, detail]);

  if (detail === undefined) {
    return <div className="h-48 animate-pulse rounded-sheet bg-inset" />;
  }
  if (!detail) {
    return (
      <div>
        <h1 className="font-display text-4xl tracking-tight">Not in this company.</h1>
        <p className="mt-2 text-sm text-danger">{error ?? "That asset is not on your register."}</p>
        <Link to="/app/assets" className="mt-4 inline-flex min-h-11 items-center text-sm font-medium text-accent">
          Back to assets
        </Link>
      </div>
    );
  }

  const { asset } = detail;
  const formValues: AssetFormValues = {
    partNumber: asset.partNumber,
    type: asset.type,
    description: asset.description,
    swl: asset.swl ?? "",
    manufacturer: asset.manufacturer ?? "",
    serialNumber: asset.serialNumber ?? "",
    location: asset.location ?? "",
    status: asset.status,
    nextDueDate: asset.nextDueDate ?? "",
    notes: asset.notes ?? "",
  };

  return (
    <div className="grid gap-6">
      <div>
        <Link to="/app/assets" className="text-sm font-medium text-muted">
          All assets
        </Link>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="break-all font-mono text-3xl tracking-tight">{asset.partNumber}</h1>
            <p className="mt-1 text-muted">
              {asset.type}
              {asset.description ? ` · ${asset.description}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <AssetBadge status={asset.status} nextDue={asset.nextDueDate} />
          </div>
        </div>
        <AssetPhoto
          assetId={asset.id}
          file={detail.files.find((item) => item.kind === "asset") ?? null}
          canWrite={canWrite}
          onChanged={() => void reload()}
          onError={setError}
        />
      </div>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <section className="grid gap-px overflow-hidden rounded-sheet border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
        <Fact label="Title" value={asset.type} />
        <Fact label="SWL / WLL" value={asset.swl} />
        <Fact label="Serial" value={asset.serialNumber} />
        <Fact label="Manufacturer" value={asset.manufacturer} />
        <Fact label="Location" value={asset.location} />
        <Fact label="Next due" value={formatDate(asset.nextDueDate)} />
        <Fact label="Updated" value={formatDate(asset.updatedOn)} />
      </section>
      {asset.notes ? (
        <section className="overflow-hidden rounded-sheet border border-line bg-card">
          <div className="px-4 py-3">
            <p className="text-xs text-muted">Notes</p>
            <p className="mt-1 text-pretty text-sm whitespace-pre-wrap">{asset.notes}</p>
          </div>
        </section>
      ) : null}
      {canWrite ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => setEditing((value) => !value)}>
            {editing ? "Close edit" : "Edit asset"}
          </Button>
          {isAdmin ? (
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                if (!confirmDelete) {
                  setConfirmDelete(true);
                  return;
                }
                void deleteAsset({ data: { id: asset.id } })
                  .then(() => navigate({ to: "/app/assets" }))
                  .catch((err: unknown) => {
                    setError(err instanceof Error ? err.message : "Could not remove the asset.");
                    setConfirmDelete(false);
                  });
              }}
            >
              {confirmDelete ? "Confirm remove" : "Remove"}
            </Button>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-muted">View access. Inspections and uploads need an inspector or admin.</p>
      )}
      {editing && canWrite ? (
        <AssetForm
          key={asset.updatedOn + asset.partNumber}
          initial={formValues}
          submitLabel="Save changes"
          onCancel={() => setEditing(false)}
          onSubmit={async (values, photo) => {
            const saved = await updateAsset({ data: { id: asset.id, ...values } });
            if (photo) await uploadCompanyFile({ assetId: asset.id, file: photo, kind: "asset" });
            const next = await getAsset({ data: { id: asset.id } });
            setDetail(next ?? { ...detail, asset: saved });
            setEditing(false);
          }}
        />
      ) : null}
      <section className={canWrite ? "grid gap-6 lg:grid-cols-[1.15fr_0.85fr]" : "grid gap-6"}>
        <div className={canWrite ? "order-2 lg:order-1" : undefined}>
          <AssetHistory
            key={asset.id}
            inspections={detail.inspections}
            files={detail.files}
            freshId={freshId}
          />
        </div>
        {canWrite ? (
          <div className="order-1 grid content-start gap-6 lg:order-2">
            <div className="rounded-sheet border border-line bg-card p-4">
              <h2 className="font-display text-2xl tracking-tight">Add inspection</h2>
              <p className="mt-2 text-sm text-muted">
                Saves the exam, writes the next due date onto this asset, and can attach the certificate.
              </p>
              <InspectionForm
                key={asset.id}
                assetId={asset.id}
                status={asset.status}
                inspectorName={user?.displayName || workspace.member.email}
                onRecorded={(saved) => {
                  setError(null);
                  setFreshId(saved.inspection.id);
                  setDetail((current) => {
                    if (!current) return current;
                    return {
                      ...current,
                      asset: {
                        ...current.asset,
                        status: saved.assetStatus,
                        nextDueDate: saved.assetNextDue,
                        updatedOn: todayISO(),
                      },
                      inspections: [
                        saved.inspection,
                        ...current.inspections.filter((row) => row.id !== saved.inspection.id),
                      ],
                      files: saved.file
                        ? [saved.file, ...current.files.filter((row) => row.id !== saved.file?.id)]
                        : current.files,
                    };
                  });
                  void getAsset({ data: { id: asset.id } }).then((value) => {
                    if (value) setDetail(value);
                  });
                }}
                onCertFailed={(inspectionId) => setCertTarget(inspectionId)}
              />
            </div>
            <div className="rounded-sheet border border-line bg-card p-4" id="attach-certificate">
              <h2 className="font-display text-2xl tracking-tight">Attach a certificate</h2>
              <p className="mt-2 text-sm text-muted">
                Add the cert with the exam above, or attach it here to an inspection already on the history.
              </p>
              <div className="mt-4">
                <CertUpload
                  key={asset.id}
                  assetId={asset.id}
                  defaultInspectionId={certTarget}
                  inspections={detail.inspections.map((row) => ({
                    id: row.id,
                    label: `${formatDate(row.inspectionDate)} · ${RESULT_LABEL[row.result]}`,
                  }))}
                  onUploaded={() => void reload()}
                />
              </div>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="bg-card px-4 py-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-sm tabular-nums">{value || "—"}</p>
    </div>
  );
}

type RecordedInspection = {
  inspection: InspectionRow;
  assetStatus: AssetStatus;
  assetNextDue: string | null;
  file: FileRow | null;
};

function InspectionForm({
  assetId,
  status,
  inspectorName,
  onRecorded,
  onCertFailed,
}: {
  assetId: string;
  status: AssetStatus;
  inspectorName: string;
  onRecorded: (saved: RecordedInspection) => void;
  onCertFailed: (inspectionId: string) => void;
}) {
  const [inspectionDate, setInspectionDate] = useState(todayISO());
  const [result, setResult] = useState<InspectionResult>("pass");
  const [nextDueDate, setNextDueDate] = useState("");
  const [inspector, setInspector] = useState(inspectorName);
  const [jobReference, setJobReference] = useState("");
  const [notes, setNotes] = useState("");
  const [assetStatus, setAssetStatus] = useState<AssetStatus>(suggestStatus("pass", status));
  const [file, setFile] = useState<File | null>(null);
  const [photos, setPhotos] = useState<{ key: string; file: File; caption: string }[]>([]);
  const [inputKey, setInputKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const statusHint =
    result === "fail"
      ? "A fail suggests quarantine. Choose out of service if it should stay off the hook."
      : result === "pass" && assetStatus !== status
        ? "A pass puts quarantined or out-of-service gear back in service. Change it if that is wrong."
        : "Written onto the asset with this exam.";

  function applyResult(next: InspectionResult) {
    setResult(next);
    setAssetStatus(suggestStatus(next, status));
    setNotice(null);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setNotice(null);
    if ((result === "pass" || result === "conditional") && !nextDueDate) {
      setError("Set the next due date so the dashboard knows when to call it back.");
      return;
    }
    setPending(true);
    setError(null);
    const inspectorTrimmed = inspector.trim();
    const jobTrimmed = jobReference.trim();
    const notesTrimmed = notes.trim();
    try {
      const saved = await recordInspection({
        data: {
          assetId,
          inspectionDate,
          result,
          nextDueDate,
          inspectorName: inspectorTrimmed,
          jobReference: jobTrimmed,
          notes: notesTrimmed,
          assetStatus,
        },
      });
      const inspection: InspectionRow = {
        id: saved.id,
        inspectionDate,
        result,
        nextDueDate: nextDueDate || null,
        inspectorName: inspectorTrimmed,
        jobReference: jobTrimmed || null,
        notes: notesTrimmed || null,
      };
      let uploaded: FileRow | null = null;
      let certError: string | null = null;
      if (file) {
        try {
          const stored = await uploadCompanyFile({ assetId, inspectionId: saved.id, file });
          uploaded = {
            id: stored.id,
            inspectionId: stored.inspectionId ?? saved.id,
            fileName: stored.fileName,
            mimeType: stored.mimeType,
            byteSize: stored.byteSize,
            uploadedOn: todayISO(),
            kind: "certificate",
            caption: null,
          };
        } catch (err) {
          certError = err instanceof Error ? err.message : "Could not upload that certificate.";
          onCertFailed(saved.id);
        }
      }
      const photoErrors: string[] = [];
      for (const photo of photos) {
        try {
          await uploadCompanyFile({
            assetId,
            inspectionId: saved.id,
            file: photo.file,
            kind: "inspection",
            caption: photo.caption,
          });
        } catch (err) {
          photoErrors.push(err instanceof Error ? err.message : "Could not upload a photo.");
        }
      }
      const photoCount = photos.length;
      onRecorded({
        inspection,
        assetStatus: saved.assetStatus,
        assetNextDue: saved.assetNextDue,
        file: uploaded,
      });
      setResult("pass");
      setAssetStatus(suggestStatus("pass", saved.assetStatus));
      setNextDueDate("");
      setJobReference("");
      setNotes("");
      setFile(null);
      setPhotos([]);
      setInputKey((value) => value + 1);
      setPending(false);
      if (certError || photoErrors.length > 0) {
        const parts = [
          certError ? `The certificate did not upload. ${certError}` : "",
          photoErrors.length > 0 ? `${photoErrors.length} photo${photoErrors.length === 1 ? "" : "s"} did not upload.` : "",
        ].filter(Boolean);
        setError(`The exam is on the history. ${parts.join(" ")}`);
      } else {
        setNotice(
          photoCount > 0
            ? "Saved, with the wear photos on the history."
            : uploaded
              ? "Saved, with the certificate on the history."
              : "Saved. It is on the history.",
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not record the inspection.");
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-4 grid gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Inspection date">
          <Input
            type="date"
            required
            value={inspectionDate}
            onChange={(event) => {
              setInspectionDate(event.target.value);
              setNotice(null);
            }}
          />
        </Field>
        <Field label="Result">
          <Select value={result} onChange={(event) => applyResult(event.target.value as InspectionResult)}>
            {INSPECTION_RESULTS.map((item) => (
              <option key={item} value={item}>
                {RESULT_LABEL[item]}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Status after this exam" hint={statusHint}>
        <Select
          value={assetStatus}
          onChange={(event) => {
            setAssetStatus(event.target.value as AssetStatus);
            setNotice(null);
          }}
        >
          {ASSET_STATUSES.map((item) => (
            <option key={item} value={item}>
              {STATUS_LABEL[item]}
            </option>
          ))}
        </Select>
      </Field>
      <div className="grid gap-1.5">
        <span className="text-sm font-medium text-ink">Next due date</span>
        <Input
          type="date"
          required={result !== "fail"}
          value={nextDueDate}
          onChange={(event) => {
            setNextDueDate(event.target.value);
            setNotice(null);
          }}
        />
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setNextDueDate(addMonthsISO(inspectionDate || todayISO(), 6));
              setNotice(null);
            }}
          >
            Due in 6 months
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setNextDueDate(addMonthsISO(inspectionDate || todayISO(), 12));
              setNotice(null);
            }}
          >
            Due in 12 months
          </Button>
        </div>
        <span className="text-xs text-muted">
          {result === "fail"
            ? "Optional on a fail. Leave it blank to keep the date already on the asset."
            : "Required for a pass or conditional. Counted from the inspection date."}
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Inspector name">
          <Input
            required
            value={inspector}
            onChange={(event) => {
              setInspector(event.target.value);
              setNotice(null);
            }}
          />
        </Field>
        <Field label="Job reference">
          <Input
            value={jobReference}
            onChange={(event) => {
              setJobReference(event.target.value);
              setNotice(null);
            }}
          />
        </Field>
      </div>
      <Field label="Notes">
        <Textarea
          value={notes}
          onChange={(event) => {
            setNotes(event.target.value);
            setNotice(null);
          }}
        />
      </Field>
      <Field label="Certificate" hint="Optional. PDF, JPEG, PNG, or WebP, up to 4 MB. It is filed on this exam.">
        <input
          key={inputKey}
          type="file"
          accept={FILE_ACCEPT}
          onChange={(event) => {
            setFile(event.target.files?.[0] ?? null);
            setNotice(null);
          }}
          className="block w-full text-sm text-ink file:mr-3 file:min-h-11 file:cursor-pointer file:rounded-control file:border-0 file:bg-inset file:px-3 file:text-sm file:font-medium file:text-ink"
        />
      </Field>
      <div className="grid gap-2">
        <span className="text-sm font-medium text-ink">Wear photos</span>
        <p className="text-xs text-muted">Optional. JPEG, PNG, or WebP, up to 8 MB each. A short note helps later.</p>
        {photos.length > 0 ? (
          <ul className="grid gap-2">
            {photos.map((photo) => (
              <li key={photo.key} className="grid gap-2 rounded-md border border-[#E5E7EB] bg-white p-2 sm:grid-cols-[1fr_auto] sm:items-center">
                <div className="min-w-0">
                  <p className="truncate text-sm">{photo.file.name}</p>
                  <Input
                    value={photo.caption}
                    maxLength={140}
                    placeholder="Wear on pin"
                    aria-label={`Caption for ${photo.file.name}`}
                    onChange={(event) => {
                      const caption = event.target.value;
                      setPhotos((current) => current.map((item) => (item.key === photo.key ? { ...item, caption } : item)));
                    }}
                  />
                </div>
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => setPhotos((current) => current.filter((item) => item.key !== photo.key))}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
        <input
          key={`photos-${inputKey}`}
          type="file"
          accept={IMAGE_ACCEPT}
          multiple
          onChange={(event) => {
            const picked = Array.from(event.target.files ?? []);
            event.target.value = "";
            const tooBig = picked.find((item) => item.size > MAX_IMAGE_BYTES);
            if (tooBig) {
              setError("Keep photos under 8 MB.");
              return;
            }
            setError(null);
            setPhotos((current) => [
              ...current,
              ...picked.map((item) => ({ key: crypto.randomUUID(), file: item, caption: "" })),
            ]);
          }}
          className="block w-full text-sm text-ink file:mr-3 file:min-h-10 file:cursor-pointer file:rounded-md file:border file:border-[#D1D5DB] file:bg-white file:px-3 file:text-sm file:font-medium file:text-[#374151]"
        />
      </div>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      {notice ? <p className="text-sm text-accent">{notice}</p> : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save inspection"}
      </Button>
    </form>
  );
}

function AssetPhoto({
  assetId,
  file,
  canWrite,
  onChanged,
  onError,
}: {
  assetId: string;
  file: FileRow | null;
  canWrite: boolean;
  onChanged: () => void;
  onError: (message: string | null) => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const fileId = file?.id ?? null;
  const byteSize = file?.byteSize ?? 0;

  useEffect(() => {
    if (!fileId || byteSize <= 0) {
      setUrl(null);
      return;
    }
    let cancelled = false;
    let objectUrl: string | null = null;
    fetchCompanyFile(fileId)
      .then((loaded) => {
        if (cancelled) {
          URL.revokeObjectURL(loaded.url);
          return;
        }
        objectUrl = loaded.url;
        setUrl(loaded.url);
      })
      .catch(() => {
        if (!cancelled) setUrl(null);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [fileId, byteSize]);

  if (!file && !canWrite) return null;

  async function onPick(next: File | null) {
    if (!next) return;
    if (next.size > MAX_IMAGE_BYTES) {
      onError("Keep photos under 8 MB.");
      return;
    }
    setPending(true);
    onError(null);
    try {
      await uploadCompanyFile({ assetId, file: next, kind: "asset" });
      onChanged();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not upload that photo.");
    } finally {
      setPending(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <figure className="mt-4 max-w-sm">
      {url ? (
        <img
          src={url}
          alt=""
          className="max-h-64 w-full rounded-lg border border-[#E5E7EB] bg-white object-contain"
        />
      ) : file ? (
        <div className="h-40 animate-pulse rounded-lg bg-[#F3F4F6]" />
      ) : null}
      {canWrite ? (
        <div className="mt-2 flex flex-wrap gap-2">
          <input
            ref={inputRef}
            type="file"
            accept={IMAGE_ACCEPT}
            className="sr-only"
            onChange={(event) => void onPick(event.target.files?.[0] ?? null)}
          />
          <Button type="button" variant="outline" disabled={pending} onClick={() => inputRef.current?.click()}>
            {pending ? "Uploading…" : file ? "Replace photo" : "Add photo"}
          </Button>
          {file ? (
            <Button
              type="button"
              variant="destructive"
              disabled={pending}
              onClick={() => {
                setPending(true);
                onError(null);
                void deleteCompanyFile(file.id)
                  .then(() => onChanged())
                  .catch((err: unknown) => {
                    onError(err instanceof Error ? err.message : "Could not remove that photo.");
                  })
                  .finally(() => setPending(false));
              }}
            >
              Remove photo
            </Button>
          ) : null}
        </div>
      ) : null}
    </figure>
  );
}
