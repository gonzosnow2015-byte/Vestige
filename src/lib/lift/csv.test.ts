import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { previewAssetCsv, rowsToImport } from "./csv.ts";

const HEADER =
  "part_number,type,description,swl,manufacturer,serial_number,location,status,next_due_date,notes";

describe("previewAssetCsv", () => {
  it("previews adds, and switches existing parts between skip and update", () => {
    const csv = [
      HEADER,
      "BS-1,Bow shackle,Green pin,3.25 t,Crosby,1,Bay 2,in_service,2027-03-12,",
      "WS-9,Webbing sling,,,,,,,",
    ].join("\n");
    const skip = previewAssetCsv(csv, ["ws-9"], "skip");
    assert.equal(skip.error, null);
    assert.equal(skip.rows[0]?.action, "add");
    assert.equal(skip.rows[1]?.action, "skip");
    assert.equal(skip.rows[1]?.input?.status, "in_service");
    assert.equal(rowsToImport(skip.rows).length, 1);

    const update = previewAssetCsv(csv, ["WS-9"], "update");
    assert.equal(update.rows[1]?.action, "update");
    assert.equal(rowsToImport(update.rows).map((row) => row.partNumber).join(","), "BS-1,WS-9");
  });

  it("keeps commas inside quotes and accepts friendly headers", () => {
    const csv = ['Part number,Type,Notes', 'BS-2,Hook,"Checked, tagged"'].join("\n");
    const preview = previewAssetCsv(csv, [], "skip");
    assert.equal(preview.rows[0]?.input?.notes, "Checked, tagged");
    assert.equal(preview.rows[0]?.action, "add");
  });

  it("rejects a missing part number column, a bad status, a bad date, and a repeated part", () => {
    assert.match(previewAssetCsv("type\nHook\n", [], "skip").error ?? "", /part_number/);

    const csv = [
      HEADER,
      "BS-3,Hook,,,,,,nope,2027-01-01,",
      "BS-4,Hook,,,,,,,04/11/2026,",
      "BS-5,Hook,,,,,,,2027-01-01,",
      "bs-5,Hook,,,,,,,,",
      ",Hook,,,,,,,,",
    ].join("\n");
    const preview = previewAssetCsv(csv, [], "update");
    assert.equal(preview.rows[0]?.action, "error");
    assert.match(preview.rows[0]?.message ?? "", /Status/);
    assert.equal(preview.rows[1]?.action, "error");
    assert.match(preview.rows[1]?.message ?? "", /date/);
    assert.equal(preview.rows[2]?.action, "add");
    assert.equal(preview.rows[3]?.action, "error");
    assert.match(preview.rows[3]?.message ?? "", /earlier row/);
    assert.equal(preview.rows[4]?.action, "error");
  });

  it("strips a BOM and ignores a blank line", () => {
    const csv = `\uFEFF${HEADER}\n\nBS-5,Hook,,,,,,,,\n`;
    const preview = previewAssetCsv(csv, [], "skip");
    assert.equal(preview.rows.length, 1);
    assert.equal(preview.rows[0]?.partNumber, "BS-5");
  });

  it("maps a title column onto the stored title, and still accepts type", () => {
    const titled = previewAssetCsv("part_number,title\nBS-7,Deck winch\n", [], "skip");
    assert.equal(titled.error, null);
    assert.equal(titled.rows[0]?.input?.type, "Deck winch");

    const both = previewAssetCsv("part_number,type,title\nBS-8,Hook,Main hook\n", [], "skip");
    assert.equal(both.rows[0]?.input?.type, "Main hook");

    const fallback = previewAssetCsv("part_number,type,title\nBS-9,Hook,\n", [], "skip");
    assert.equal(fallback.rows[0]?.input?.type, "Hook");

    assert.match(previewAssetCsv("part_number\nBS-1\n", [], "skip").error ?? "", /title/);
  });

  it("reports an unclosed quote", () => {
    assert.match(previewAssetCsv('part_number,type\n"BS-6,Hook\n', [], "skip").error ?? "", /quote/);
  });
});
