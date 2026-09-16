import { API_BASE_URL } from "./config.js";
import { t, localeTag } from "./i18n/index.js";

const VERIFY_TIMEOUT_MS = 10_000;

export type VerifyFailureReason = "invalid" | "network" | "server";

// /v1/me yanıtı. Sunucudan geldiği için alanlar doğrulanmıyor, opsiyonel.
export interface AccountInfo {
  name?: string;
  email?: string;
  credits_remaining?: number;
  premium?: boolean;
  premium_days_remaining?: number;
}

export type VerifyResult =
  | { ok: true; account: AccountInfo | null }
  | { ok: false; reason: VerifyFailureReason; status?: number };

// Doğrulama başarısızlığının nedenini kullanıcıya uygun mesaja çevir.
// (Örn. 503 sırasında "geçersiz anahtar" demek yanıltıcı olur.)
export function verifyFailureMessage(reason: VerifyFailureReason): string {
  if (reason === "network") return t("onboarding.network");
  if (reason === "server") return t("onboarding.serverError");
  return t("onboarding.invalid");
}

export async function verifyApiKey(apiKey: unknown): Promise<VerifyResult> {
  const key = String(apiKey ?? "").trim();
  if (!key) return { ok: false, reason: "invalid" };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS);
  try {
    const response = await fetch(`${API_BASE_URL.replace(/\/+$/, "")}/me`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: controller.signal,
    });
    if (response.status === 401 || response.status === 403) {
      return { ok: false, reason: "invalid" };
    }
    if (!response.ok) return { ok: false, reason: "server", status: response.status };
    const account: unknown = await response.json();
    return {
      ok: true,
      account: account && typeof account === "object" ? (account as AccountInfo) : null,
    };
  } catch {
    return { ok: false, reason: "network" };
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchAccount(
  apiKey: string | null | undefined,
): Promise<AccountInfo | null> {
  if (!apiKey) return null;
  try {
    const response = await fetch(`${API_BASE_URL.replace(/\/+$/, "")}/me`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!response.ok) return null;
    const body: unknown = await response.json();
    return body && typeof body === "object" ? (body as AccountInfo) : null;
  } catch {
    return null;
  }
}

export function formatAccount(account: AccountInfo | null | undefined): string {
  if (!account) return t("account.failed");
  const lines = [
    `${t("account.name")}${account.name ?? "-"}`,
    `${t("account.email")}${account.email ?? "-"}`,
    `${t("account.credits")}${
      typeof account.credits_remaining === "number"
        ? account.credits_remaining.toLocaleString(localeTag())
        : "-"
    }`,
  ];
  if (account.premium) {
    const days = account.premium_days_remaining;
    lines.push(
      `${t("account.premiumYes")}${
        typeof days === "number" ? t("account.daysLeft", { days }) : ""
      }`,
    );
  } else {
    lines.push(t("account.premiumNo"));
  }
  return lines.join("\n");
}
