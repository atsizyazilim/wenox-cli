import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { configDir } from "./config.js";

export const REGISTRY_URL =
  process.env.WENOX_REGISTRY_URL ||
  "https://registry.npmjs.org/@wenox/cli/latest";

export const UPGRADE_COMMAND = "npm i -g @wenox/cli";

// Sürüm sorgusu her açılışta yapılmaz ama güncellemeyi de gizlememeli.
// Tek bir "taze" penceresi vardı ve 6 saatlik olduğu için, yayınlanan yeni sürüm
// o pencere bitene kadar görünmüyordu. Artık üç ayrı pencere var:
//  - Önbellek "zaten eski sürümdesin" diyorsa: ağa hiç çıkılmaz, uyarı hemen.
//  - Önbellek "güncel sürümdesin" diyorsa: kısa aralıkla tazelenir, çünkü yeni
//    bir sürüm her an yayınlanmış olabilir.
//  - Sorgu başarısız olduysa: kısa süre sonra tekrar denenir; başarısız sorgu
//    uzun bir "taze" penceresi bırakırsa güncelleme saatlerce gizlenirdi.
const CURRENT_TTL_MS = 15 * 60 * 1000;
const STALE_TTL_MS = 6 * 60 * 60 * 1000;
const RETRY_MS = 5 * 60 * 1000;
const TIMEOUT_MS = 1500;

export function updateCacheFile(): string {
  return path.join(configDir(), "update.json");
}

function parseVersion(value: unknown): [number, number, number] | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(String(value ?? "").trim());
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

// Ön sürüm ve derleme meta verisi yok sayılır; yalnızca sayısal çekirdek
// karşılaştırılır. Çözümlenemeyen bir sürüm asla güncelleme zorlamaz.
export function isNewer(candidate: unknown, current: unknown): boolean {
  const next = parseVersion(candidate);
  const here = parseVersion(current);
  if (!next || !here) return false;
  for (let index = 0; index < 3; index += 1) {
    if (next[index] !== here[index]) return next[index] > here[index];
  }
  return false;
}

interface UpdateCache {
  latest?: string | null;
  checkedAt?: number;
  // Son sorgu başarısız olduysa işaretlenir: kısa süre sonra tekrar denenir.
  failed?: boolean;
}

function readCache(): UpdateCache | null {
  try {
    const data: unknown = JSON.parse(fs.readFileSync(updateCacheFile(), "utf8"));
    return data && typeof data === "object" ? (data as UpdateCache) : null;
  } catch {
    return null;
  }
}

function writeCache(latest: string | null, checkedAt: number, failed = false): void {
  try {
    fs.mkdirSync(configDir(), { recursive: true, mode: 0o700 });
    fs.writeFileSync(
      updateCacheFile(),
      `${JSON.stringify({ latest, checkedAt, failed }, null, 2)}\n`,
      { encoding: "utf8", mode: 0o600 },
    );
  } catch {
    // Önbellek yazılamazsa sorgu bir sonraki açılışta tekrarlanır.
  }
}

export async function fetchLatestVersion(
  { timeoutMs = TIMEOUT_MS, fetchImpl = globalThis.fetch }: {
    timeoutMs?: number;
    fetchImpl?: typeof fetch;
  } = {},
): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(REGISTRY_URL, {
      signal: controller.signal,
      headers: { accept: "application/json" },
    });
    if (!response?.ok) return null;
    const data = (await response.json()) as { version?: unknown };
    return typeof data?.version === "string" ? data.version : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export interface UpgradeResult {
  code: number | null;
  failed: boolean;
}

interface UpgradeChild {
  on(event: string, handler: (...args: unknown[]) => void): unknown;
}

// Güncellemeyi kullanıcı adına çalıştırır. Ekran Ink'i askıya alıp terminali
// sürece devreder, böylece npm'in çıktısı doğrudan kullanıcıya görünür; burada
// yalnızca süreç yönetimi var, o yüzden testte sahte spawn ile sınanabiliyor.
export type UpgradeSpawn = (
  command: string,
  args: string[],
  options: { stdio: "inherit"; shell: boolean },
) => UpgradeChild;

export function runUpgrade(
  spawnImpl: UpgradeSpawn = spawn as unknown as UpgradeSpawn,
): Promise<UpgradeResult> {
  return new Promise((resolve) => {
    try {
      const child = spawnImpl("npm", ["install", "-g", "@wenox/cli"], {
        stdio: "inherit",
        shell: true,
      });
      child.on("close", (code) => {
        const status = typeof code === "number" ? code : null;
        resolve({ code: status, failed: status !== 0 });
      });
      child.on("error", () => resolve({ code: null, failed: true }));
    } catch {
      resolve({ code: null, failed: true });
    }
  });
}

export interface UpdateCheckResult {
  outdated: boolean;
  skipped?: boolean;
  unknown?: boolean;
  current?: string;
  latest?: string;
}

export async function checkForUpdate(
  { current, fetchImpl, now = Date.now() }: {
    current?: string;
    fetchImpl?: typeof fetch;
    now?: number;
  } = {},
): Promise<UpdateCheckResult> {
  if (process.env.WENOX_SKIP_UPDATE_CHECK) {
    return { outdated: false, skipped: true };
  }

  const cached = readCache();
  const cachedLatest = typeof cached?.latest === "string" ? cached.latest : null;
  const checkedAt = Number(cached?.checkedAt ?? 0);
  const age = Number.isFinite(checkedAt) ? now - checkedAt : Number.POSITIVE_INFINITY;

  // Önbellek zaten "eski sürümdesin" diyorsa ağa hiç çıkılmaz: uyarı hemen
  // gösterilir. Aksi halde (ya da son sorgu başarısızsa) tazeleme penceresi kısa.
  const cachedOutdated = cachedLatest !== null && isNewer(cachedLatest, current);
  const window = cached?.failed ? RETRY_MS : cachedOutdated ? STALE_TTL_MS : CURRENT_TTL_MS;
  const fresh = age >= 0 && age < window;

  let latest = cachedLatest;

  if (!fresh) {
    const fetched = await fetchLatestVersion({ fetchImpl });
    latest = fetched ?? cachedLatest;
    // Başarısız sorgu uzun süre "taze" sayılmaz; kısa süre sonra tekrar denenir.
    writeCache(latest, now, !fetched);
  }

  // Hangi sürümün güncel olduğu bilinmiyorsa kullanıcı engellenmez.
  if (!latest) return { outdated: false, unknown: true };

  return { outdated: isNewer(latest, current), current, latest };
}
