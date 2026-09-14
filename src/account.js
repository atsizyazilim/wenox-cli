import { API_BASE_URL } from "./config.js";
import { t, localeTag } from "./i18n/index.js";

const VERIFY_TIMEOUT_MS = 10_000;

// Doğrulama başarısızlığının nedenini kullanıcıya uygun mesaja çevir.
// (Örn. 503 sırasında "geçersiz anahtar" demek yanıltıcı olur.)
export function verifyFailureMessage(reason) {
  if (reason === "network") return t("onboarding.network");
  if (reason === "server") return t("onboarding.serverError");
  return t("onboarding.invalid");
}

export async function verifyApiKey(apiKey) {
  const key = String(apiKey ?? "").trim();
  if (!key) return { ok: false, reason: "invalid" };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS);
  try {
    const response = await fetch(`${API_BASE_URL.replace(/\/+$/, "")}/me`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: controller.signal,
    });
    if (response.status === 401 || response.status === 403) return { ok: false, reason: "invalid" };
    if (!response.ok) return { ok: false, reason: "server", status: response.status };
    const account = await response.json();
    return { ok: true, account: account && typeof account === "object" ? account : null };
  } catch {
    return { ok: false, reason: "network" };
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchAccount(apiKey) {
  if (!apiKey) return null;
  try {
    const response = await fetch(`${API_BASE_URL.replace(/\/+$/, "")}/me`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!response.ok) return null;
    const body = await response.json();
    return body && typeof body === "object" ? body : null;
  } catch {
    return null;
  }
}

export function formatAccount(account) {
  if (!account) return t("account.failed");
  const lines = [
    `${t("account.name")}${account.name ?? "-"}`,
    `${t("account.email")}${account.email ?? "-"}`,
    `${t("account.credits")}${typeof account.credits_remaining === "number" ? account.credits_remaining.toLocaleString(localeTag()) : "-"}`,
  ];
  if (account.premium) {
    const days = account.premium_days_remaining;
    lines.push(`${t("account.premiumYes")}${typeof days === "number" ? t("account.daysLeft", { days }) : ""}`);
  } else {
    lines.push(t("account.premiumNo"));
  }
  return lines.join("\n");
}
