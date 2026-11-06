import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addMonthsISO,
  attentionCounts,
  defaultAttention,
  endOfMonthISO,
  endOfQuarterISO,
  endOfWeekISO,
  endOfYearISO,
  matchesAttention,
  suggestStatus,
} from "./format.ts";

const TODAY = "2026-11-04";

describe("calendar windows", () => {
  it("ends the week on Sunday, including a Sunday today", () => {
    assert.equal(endOfWeekISO(TODAY), "2026-11-08");
    assert.equal(endOfWeekISO("2026-11-01"), "2026-11-01");
  });

  it("lets a week cross the month and the year", () => {
    assert.equal(endOfWeekISO("2026-11-30"), "2026-12-06");
    assert.equal(endOfWeekISO("2026-12-30"), "2027-01-03");
  });

  it("closes month, quarter, and year on their last day", () => {
    assert.equal(endOfMonthISO(TODAY), "2026-11-30");
    assert.equal(endOfMonthISO("2024-02-10"), "2024-02-29");
    assert.equal(endOfQuarterISO("2026-01-15"), "2026-03-31");
    assert.equal(endOfQuarterISO(TODAY), "2026-12-31");
    assert.equal(endOfQuarterISO("2026-03-31"), "2026-03-31");
    assert.equal(endOfYearISO(TODAY), "2026-12-31");
  });

  it("clamps month-adds to the last valid day", () => {
    assert.equal(addMonthsISO(TODAY, 6), "2027-05-04");
    assert.equal(addMonthsISO(TODAY, 12), "2027-11-04");
    assert.equal(addMonthsISO("2026-01-31", 1), "2026-02-28");
    assert.equal(addMonthsISO("2024-01-31", 1), "2024-02-29");
    assert.equal(addMonthsISO("2026-03-31", 6), "2026-09-30");
  });
});

describe("attention filters", () => {
  const book = [
    { status: "in_service", nextDueDate: "2026-11-01" },
    { status: "in_service", nextDueDate: TODAY },
    { status: "in_service", nextDueDate: "2026-11-08" },
    { status: "quarantine", nextDueDate: "2026-11-20" },
    { status: "in_service", nextDueDate: "2026-12-15" },
    { status: "in_service", nextDueDate: "2027-01-02" },
    { status: "in_service", nextDueDate: null },
    { status: "scrapped", nextDueDate: "2026-10-01" },
  ];

  it("keeps overdue, week, month, quarter, and year distinct", () => {
    assert.deepEqual(attentionCounts(book, TODAY), {
      assets: 8,
      overdue: 1,
      week: 2,
      month: 3,
      quarter: 4,
      year: 4,
    });
    assert.equal(matchesAttention(book[0], "overdue", TODAY), true);
    assert.equal(matchesAttention(book[0], "week", TODAY), false);
    assert.equal(matchesAttention(book[2], "week", TODAY), true);
    assert.equal(matchesAttention(book[4], "month", TODAY), false);
    assert.equal(matchesAttention(book[4], "quarter", TODAY), true);
    assert.equal(matchesAttention(book[5], "year", TODAY), false);
    assert.equal(matchesAttention(book[5], "all", TODAY), false);
    assert.equal(matchesAttention(book[0], "all", TODAY), true);
    assert.equal(matchesAttention(book[4], "all", TODAY), true);
    assert.equal(matchesAttention(book[6], "all", TODAY), false);
    assert.equal(matchesAttention(book[6], "month", TODAY), false);
    assert.equal(matchesAttention(book[7], "overdue", TODAY), false);
    assert.equal(matchesAttention(book[7], "all", TODAY), false);
  });

  it("opens on overdue, then the soonest window that has work", () => {
    assert.equal(defaultAttention({ overdue: 2, week: 1, month: 4 }), "overdue");
    assert.equal(defaultAttention({ overdue: 0, week: 1, month: 4 }), "week");
    assert.equal(defaultAttention({ overdue: 0, week: 0, month: 4 }), "month");
    assert.equal(defaultAttention({ overdue: 0, week: 0, month: 0 }), "all");
  });

  it("counts a year-crossing week only in that week", () => {
    const asset = { status: "in_service", nextDueDate: "2027-01-02" };
    assert.equal(matchesAttention(asset, "week", "2026-12-30"), true);
    assert.equal(matchesAttention(asset, "year", "2026-12-30"), false);
    assert.equal(matchesAttention(asset, "all", "2026-12-30"), true);
    assert.equal(matchesAttention({ status: "in_service", nextDueDate: "2027-06-01" }, "all", "2026-12-30"), false);
    assert.equal(attentionCounts([asset], "2026-12-30").week, 1);
    assert.equal(attentionCounts([asset], "2026-12-30").year, 0);
  });
});

describe("suggestStatus", () => {
  it("quarantines a failed in-service asset and restores a pass", () => {
    assert.equal(suggestStatus("fail", "in_service"), "quarantine");
    assert.equal(suggestStatus("fail", "quarantine"), "quarantine");
    assert.equal(suggestStatus("fail", "out_of_service"), "out_of_service");
    assert.equal(suggestStatus("fail", "scrapped"), "scrapped");
    assert.equal(suggestStatus("pass", "quarantine"), "in_service");
    assert.equal(suggestStatus("pass", "out_of_service"), "in_service");
    assert.equal(suggestStatus("pass", "in_service"), "in_service");
    assert.equal(suggestStatus("conditional", "quarantine"), "quarantine");
    assert.equal(suggestStatus("conditional", "in_service"), "in_service");
  });
});
