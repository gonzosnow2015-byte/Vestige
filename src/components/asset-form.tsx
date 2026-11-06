import { useState, type FormEvent } from "react";
import { Field } from "@/components/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { IMAGE_ACCEPT, MAX_IMAGE_BYTES } from "@/lib/lift/file-kind";
import { ASSET_STATUSES, STATUS_LABEL, type AssetStatus } from "@/lib/lift/types";

export type AssetFormValues = {
  partNumber: string;
  type: string;
  description: string;
  swl: string;
  manufacturer: string;
  serialNumber: string;
  location: string;
  status: AssetStatus;
  nextDueDate: string;
  notes: string;
};

export const EMPTY_ASSET: AssetFormValues = {
  partNumber: "",
  type: "",
  description: "",
  swl: "",
  manufacturer: "",
  serialNumber: "",
  location: "",
  status: "in_service",
  nextDueDate: "",
  notes: "",
};

export function AssetForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: AssetFormValues;
  submitLabel: string;
  onSubmit: (values: AssetFormValues, photo: File | null) => Promise<void>;
  onCancel?: () => void;
}) {
  const [partNumber, setPartNumber] = useState(initial.partNumber);
  const [type, setType] = useState(initial.type);
  const [description, setDescription] = useState(initial.description);
  const [swl, setSwl] = useState(initial.swl);
  const [manufacturer, setManufacturer] = useState(initial.manufacturer);
  const [serialNumber, setSerialNumber] = useState(initial.serialNumber);
  const [location, setLocation] = useState(initial.location);
  const [status, setStatus] = useState<AssetStatus>(initial.status);
  const [nextDueDate, setNextDueDate] = useState(initial.nextDueDate);
  const [notes, setNotes] = useState(initial.notes);
  const [photo, setPhoto] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await onSubmit(
        {
          partNumber,
          type,
          description,
          swl,
          manufacturer,
          serialNumber,
          location,
          status,
          nextDueDate,
          notes,
        },
        photo,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the asset.");
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4 rounded-sheet border border-line bg-card p-4 md:grid-cols-2">
      <Field label="Part number">
        <Input
          value={partNumber}
          onChange={(event) => setPartNumber(event.target.value)}
          required
          autoComplete="off"
          spellCheck={false}
          className="font-mono"
        />
      </Field>
      <Field label="Title">
        <Input
          value={type}
          onChange={(event) => setType(event.target.value)}
          required
          maxLength={80}
          autoComplete="off"
        />
      </Field>
      <Field label="SWL / WLL" hint="Keep the unit in the text, for example 3.25 t.">
        <Input value={swl} onChange={(event) => setSwl(event.target.value)} placeholder="3.25 t" />
      </Field>
      <Field label="Status">
        <Select value={status} onChange={(event) => setStatus(event.target.value as AssetStatus)}>
          {ASSET_STATUSES.map((item) => (
            <option key={item} value={item}>
              {STATUS_LABEL[item]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Manufacturer">
        <Input value={manufacturer} onChange={(event) => setManufacturer(event.target.value)} />
      </Field>
      <Field label="Serial">
        <Input value={serialNumber} onChange={(event) => setSerialNumber(event.target.value)} />
      </Field>
      <Field label="Location">
        <Input value={location} onChange={(event) => setLocation(event.target.value)} />
      </Field>
      <Field label="Next due" hint="Due soon means the next 30 days. A past date is overdue.">
        <Input type="date" value={nextDueDate} onChange={(event) => setNextDueDate(event.target.value)} />
      </Field>
      <div className="md:col-span-2">
        <Field label="Description">
          <Input value={description} onChange={(event) => setDescription(event.target.value)} />
        </Field>
      </div>
      <div className="md:col-span-2">
        <Field label="Notes">
          <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} />
        </Field>
      </div>
      <div className="md:col-span-2">
        <Field label="Photo" hint="Optional. One JPEG, PNG, or WebP, up to 8 MB. Replaces the current photo.">
          <input
            type="file"
            accept={IMAGE_ACCEPT}
            onChange={(event) => {
              const next = event.target.files?.[0] ?? null;
              if (next && next.size > MAX_IMAGE_BYTES) {
                setPhoto(null);
                setError("Keep photos under 8 MB.");
                event.target.value = "";
                return;
              }
              setError(null);
              setPhoto(next);
            }}
            className="block w-full text-sm text-ink file:mr-3 file:min-h-10 file:cursor-pointer file:rounded-md file:border file:border-[#D1D5DB] file:bg-white file:px-3 file:text-sm file:font-medium file:text-[#374151]"
          />
        </Field>
      </div>
      {error ? <p className="text-sm text-danger md:col-span-2">{error}</p> : null}
      <div className="flex flex-wrap gap-2 md:col-span-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : submitLabel}
        </Button>
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}
