const ACTIVE_COMPANY_KEY = "vestige.active-company";

export function rememberedCompany(): string {
  if (typeof window === "undefined") return "";
  try {
    return sessionStorage.getItem(ACTIVE_COMPANY_KEY)?.trim() ?? "";
  } catch {
    return "";
  }
}

export function rememberCompany(companyId: string): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(ACTIVE_COMPANY_KEY, companyId);
  } catch {
    /* storage unavailable */
  }
}

export function forgetCompany(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(ACTIVE_COMPANY_KEY);
  } catch {
    /* storage unavailable */
  }
}
