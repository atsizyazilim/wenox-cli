import { API_BASE_URL } from "./config.js";
import { t, localeTag } from "./i18n/index.js";

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
