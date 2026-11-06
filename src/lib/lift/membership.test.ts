import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pickMembership } from "./membership.server.ts";

describe("pickMembership", () => {
  const rows = [{ company_id: "a" }, { company_id: "b" }];

  it("opens the only company without a stored choice", () => {
    assert.deepEqual(pickMembership([{ company_id: "a" }], null), { company_id: "a" });
  });

  it("asks for a choice when several companies are open and none is stored", () => {
    assert.equal(pickMembership(rows, null), null);
    assert.equal(pickMembership(rows, "missing"), null);
  });

  it("keeps a stored company that still belongs to the account", () => {
    assert.deepEqual(pickMembership(rows, "b"), { company_id: "b" });
  });
});
