import { AsyncLocalStorage } from "node:async_hooks";

const storage = new AsyncLocalStorage<string | null>();

/** Run a request so later reads use this membership, not another tab's company. */
export function withCompanyScope<T>(companyId: string | null | undefined, fn: () => T): T {
  const id = companyId?.trim() || null;
  return storage.run(id, fn);
}

export function scopedCompanyId(): string | null {
  return storage.getStore() ?? null;
}
