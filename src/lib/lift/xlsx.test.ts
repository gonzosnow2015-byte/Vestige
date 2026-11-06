import assert from "node:assert/strict";
import { describe, it } from "node:test";
import writeXlsxFile from "write-excel-file/node";
import type { Sheet } from "write-excel-file/node";
import { previewAssetTable } from "./csv.ts";
import { assetTemplateXlsx, excelCellText, readFirstSheet } from "./xlsx.ts";

async function workbook(sheets: Sheet<Buffer>[]): Promise<ArrayBuffer> {
  const buffer = await writeXlsxFile(sheets).toBuffer();
  return Uint8Array.from(buffer).buffer as ArrayBuffer;
}

describe("excel import", () => {
  it("reads the template the same way as CSV", async () => {
    const bytes = await (await assetTemplateXlsx()).arrayBuffer();
    const sheet = await readFirstSheet(bytes);
    assert.equal(sheet.error, null);
    const preview = previewAssetTable(sheet.rows, [], "skip");
    assert.equal(preview.error, null);
    assert.equal(preview.rows[0]?.action, "add");
    assert.equal(preview.rows[0]?.partNumber, "BS-1042");
    assert.equal(preview.rows[0]?.input?.nextDueDate, "2027-03-12");
    assert.equal(preview.rows[0]?.input?.status, "in_service");
    assert.equal(preview.rows[0]?.input?.swl, "3.25 t");
  });

  it("uses the first sheet, Excel dates, numbers, and the same duplicate rules", async () => {
    const bytes = await workbook([
      {
        sheet: "Assets",
        data: [
          ["Part number", "Type", "SWL", "Status", "Next due date"],
          [1042, "Hook", 3.25, "", { value: new Date(Date.UTC(2027, 2, 12)), format: "yyyy-mm-dd" }],
          ["WS-9", "Webbing sling", null, "quarantine", "2027-06-01"],
          ["BS-3", "Hook", null, "nope", "2027-01-01"],
        ],
      },
      {
        sheet: "Ignore",
        data: [
          ["part_number", "type"],
          ["NOT-THIS", "Hook"],
        ],
      },
    ]);
    const sheet = await readFirstSheet(bytes);
    assert.equal(sheet.error, null);
    assert.equal(excelCellText(new Date(Date.UTC(2027, 2, 12))), "2027-03-12");

    const skip = previewAssetTable(sheet.rows, ["ws-9"], "skip");
    assert.equal(skip.error, null);
    assert.equal(skip.rows.length, 3);
    assert.equal(skip.rows[0]?.partNumber, "1042");
    assert.equal(skip.rows[0]?.action, "add");
    assert.equal(skip.rows[0]?.input?.swl, "3.25");
    assert.equal(skip.rows[0]?.input?.nextDueDate, "2027-03-12");
    assert.equal(skip.rows[0]?.input?.status, "in_service");
    assert.equal(skip.rows[1]?.action, "skip");
    assert.equal(skip.rows[2]?.action, "error");

    const update = previewAssetTable(sheet.rows, ["WS-9"], "update");
    assert.equal(update.rows[1]?.action, "update");
  });

  it("rejects a file that is not a workbook", async () => {
    const bad = await readFirstSheet(Uint8Array.from([1, 2, 3, 4]).buffer);
    assert.match(bad.error ?? "", /could not be read/i);
    const huge = await readFirstSheet(new ArrayBuffer(5_000_001));
    assert.match(huge.error ?? "", /too large/);
  });
});
