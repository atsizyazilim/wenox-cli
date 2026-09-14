import fs from "node:fs";
import path from "node:path";
import { configDir } from "./config.js";

export const REGISTRY_URL =
  process.env.WENOX_REGISTRY_URL ||
  "https://registry.npmjs.org/@wenox/cli/latest";

export const UPGRADE_COMMAND = "npm i -g @wenox/cli";

// Sürüm sorgusu her açılışta değil, en fazla bu aralıkta bir yapılır.
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const TIMEOUT_MS = 1500;

export function updateCacheFile() {
  return path.join(configDir(), "update.json");
}

function parseVersion(value) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(String(value ?? "").trim());
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

// Ön sürüm ve derleme meta verisi yok sayılır; yalnızca sayısal çekirdek
// karşılaştırılır. Çözümlenemeyen bir sürüm asla güncelleme zorlamaz.
export function isNewer(candidate, current) {
  const next = parseVersion(candidate);
  const here = parseVersion(current);
  if (!next || !here) return false;
  for (let index = 0; index < 3; index += 1) {
    if (next[index] !== here[index]) return next[index] > here[index];
  }
  return false;
}

function readCache() {
  try {
    const data = JSON.parse(fs.readFileSync(updateCacheFile(), "utf8"));
    return data && typeof data === "object" ? data : null;
  } catch {
    return null;
  }
}

function writeCache(latest, checkedAt) {
  try {
    fs.mkdirSync(configDir(), { recursive: true, mode: 0o700 });
    fs.writeFileSync(
      updateCacheFile(),
      `${JSON.stringify({ latest, checkedAt }, null, 2)}\n`,
      { encoding: "utf8", mode: 0o600 },
    );
  } catch {
    // Önbellek yazılamazsa sorgu bir sonraki açılışta tekrarlanır.
  }
}

export async function fetchLatestVersion({ timeoutMs = TIMEOUT_MS, fetchImpl = globalThis.fetch } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(REGISTRY_URL, {
      signal: controller.signal,
      headers: { accept: "application/json" },
    });
    if (!response?.ok) return null;
    const data = await response.json();
    return typeof data?.version === "string" ? data.version : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function checkForUpdate({ current, fetchImpl, now = Date.now() } = {}) {
  if (process.env.WENOX_SKIP_UPDATE_CHECK) {
    return { outdated: false, skipped: true };
  }

  const cached = readCache();
  const checkedAt = Number(cached?.checkedAt ?? 0);
  const fresh = Number.isFinite(checkedAt) && now - checkedAt < CHECK_INTERVAL_MS;

  let latest = fresh ? cached.latest ?? null : null;

  if (!fresh) {
    latest = await fetchLatestVersion({ fetchImpl });
    if (latest) {
      writeCache(latest, now);
    } else {
      // Ağ/sunucu hatasında son bilinen sürüme düşülür ve bir sonraki deneme
      // için zaman damgası ilerletilir; açılışta tekrar tekrar beklemeyelim.
      latest = cached?.latest ?? null;
      writeCache(latest, now);
    }
  }

  // Hangi sürümün güncel olduğu bilinmiyorsa kullanıcı engellenmez.
  if (!latest) return { outdated: false, unknown: true };

  return { outdated: isNewer(latest, current), current, latest };
}
