import { t, localeTag } from "./i18n/index.js";

// Sunucu, kullanım kotası dolduğunda HTTP 429 ile yapılandırılmış bir hata
// döndürüyor:
//
//   { "error": { "code": "monthly_quota_exceeded", "type": "wenox_api_error",
//       "details": { "window_type": "monthly", "used_percent": 99.3,
//                    "required_percent": 0.8, "resets_at": "..." } },
//     "request_id": "..." }
//
// Bu, gerçek "çok fazla istek" (rate limit) durumundan farklı: kullanıcının
// kotası dolmuştur ve ne zaman yenileneceğini söylemek gerekir. Genel
// "rate limit" mesajı insanları yanıltıyordu.

export type QuotaWindow = "five_hour" | "weekly" | "monthly";

export interface QuotaExceeded {
  window: QuotaWindow;
  usedPercent?: number;
  requiredPercent?: number;
  resetsAt?: string;
}

const WINDOW_BY_CODE: Record<string, QuotaWindow> = {
  five_hour_quota_exceeded: "five_hour",
  weekly_quota_exceeded: "weekly",
  monthly_quota_exceeded: "monthly",
};

const WINDOWS: readonly QuotaWindow[] = ["five_hour", "weekly", "monthly"];

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function asPercent(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

// Ağdan gelen hatanın kota olup olmadığını çözer. Yapı tanınmıyorsa null döner
// ve çağıran genel hata mesajına düşer.
export function parseQuotaExceeded(error: unknown): QuotaExceeded | null {
  // OpenAI SDK'sında APIError.error = yanıt gövdesindeki `error` nesnesi.
  const body = asRecord(asRecord(error)?.error) ?? asRecord(error);
  if (!body) return null;

  const code = typeof body.code === "string" ? body.code : "";
  const details = asRecord(body.details);
  const windowType = typeof details?.window_type === "string" ? details.window_type : "";
  const window =
    WINDOW_BY_CODE[code] ??
    (WINDOWS.includes(windowType as QuotaWindow) ? (windowType as QuotaWindow) : null);
  if (!window) return null;

  return {
    window,
    usedPercent: asPercent(details?.used_percent),
    requiredPercent: asPercent(details?.required_percent),
    resetsAt: typeof details?.resets_at === "string" ? details.resets_at : undefined,
  };
}

export function quotaWindowLabel(window: QuotaWindow): string {
  if (window === "five_hour") return t("quota.window5h");
  if (window === "weekly") return t("quota.windowWeekly");
  return t("quota.windowMonthly");
}

// Yerel dile göre yüzde: tr'de "99,3", en'de "99.3".
export function formatPercent(value: number | undefined): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value.toLocaleString(localeTag(), { maximumFractionDigits: 1 });
}

// Yenilenme zamanı: bugünse yalnızca saat, ileri bir tarihse gün + saat.
export function formatReset(iso: string | undefined): string | null {
  if (!iso) return null;
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  const sameDay = at.toDateString() === new Date().toDateString();
  return at.toLocaleString(
    localeTag(),
    sameDay
      ? { hour: "2-digit", minute: "2-digit" }
      : { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" },
  );
}
