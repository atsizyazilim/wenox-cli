import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { API_BASE_URL } from "./config.js";
import { sessionHeaders } from "./session.js";

// OpenCode entegrasyonu: kullanıcı OpenCode'un sağlayıcı ekranıyla uğraşmasın
// diye yapılandırmayı biz üretiyoruz.
//
// Yapılan iş özeti:
//  - API anahtarı ayrı bir dosyaya yazılır (~/.config/wenox/api-key, 0600);
//    opencode.json içinde anahtarın kendisi değil `{file:...}` başvurusu durur.
//    Böylece yapılandırma paylaşılsa bile anahtar sızmaz.
//  - Mevcut opencode.json ASLA baştan yazılmaz: okunur, yalnızca
//    `provider.wenox` alanı eklenir/güncellenir (kullanıcının diğer
//    sağlayıcıları, MCP sunucuları, izinleri korunur).
//  - Dosya geçerli JSON değilse hiçbir şey yazılmaz; kullanıcı uyarılır.

export const OPENCODE_PROVIDER_ID = "wenox-go";
export const OPENCODE_NPM = "@ai-sdk/openai-compatible";
export const OPENCODE_SCHEMA = "https://opencode.ai/config.json";

// OpenCode global yapılandırması üç platformda da aynı yerde:
// ~/.config/opencode/opencode.json
export function opencodeDir(): string {
  return process.env.WENOX_OPENCODE_DIR ?? path.join(os.homedir(), ".config", "opencode");
}

export function opencodeConfigPath(): string {
  return path.join(opencodeDir(), "opencode.json");
}

// Anahtar dosyası: opencode.json içinde `~` ile başvurulur (OpenCode `~/`
// genişletmesini destekliyor), bu yüzden yol kullanıcının ana dizinine göre.
export function keyFilePath(): string {
  return process.env.WENOX_OPENCODE_KEY_FILE ?? path.join(os.homedir(), ".config", "wenox", "api-key");
}

export function keyFileReference(): string {
  return "{file:~/.config/wenox/api-key}";
}

// OpenCode kurulu mu: yapılandırma klasörü ya da `opencode` komutu varsa evet.
export function opencodeInstalled(): boolean {
  if (fs.existsSync(opencodeDir())) return true;
  const pathEntries = String(process.env.PATH ?? "").split(path.delimiter).filter(Boolean);
  const names = process.platform === "win32" ? ["opencode.cmd", "opencode.exe", "opencode"] : ["opencode"];
  return pathEntries.some((dir) => names.some((name) => fs.existsSync(path.join(dir, name))));
}

export interface OpenCodeModel {
  id: string;
  name: string;
  context?: number;
  output?: number;
  attachment?: boolean;
  reasoning?: boolean;
  toolCall?: boolean;
}

export type ModelFetch =
  | { ok: true; models: OpenCodeModel[] }
  | { ok: false; reason: "auth" | "network" | "empty" };

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

// Sunucudan model listesini çeker. Alanlar eksikse yalnızca var olanlar kullanılır.
export async function fetchModels(apiKey: string, timeoutMs = 15_000): Promise<ModelFetch> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${API_BASE_URL.replace(/\/+$/, "")}/models`, {
      headers: sessionHeaders({ Authorization: `Bearer ${apiKey}` }),
      signal: controller.signal,
    });
    if (response.status === 401 || response.status === 403) return { ok: false, reason: "auth" };
    if (!response.ok) return { ok: false, reason: "network" };
    const body = await response.json();
    const list = Array.isArray((body as { data?: unknown[] })?.data) ? (body as { data: unknown[] }).data : [];
    const models: OpenCodeModel[] = [];
    for (const entry of list) {
      const item = asRecord(entry);
      const id = typeof item?.id === "string" ? item.id.trim() : "";
      if (!id) continue;
      models.push({
        id,
        name: typeof item?.name === "string" && item.name.trim() ? item.name.trim() : id,
        context: asNumber(item?.context_window),
        output: asNumber(item?.max_output_tokens),
        attachment: item?.vision === true,
        reasoning: item?.reasoning === true,
        toolCall: item?.tool_call === true,
      });
    }
    return models.length > 0 ? { ok: true, models } : { ok: false, reason: "empty" };
  } catch {
    return { ok: false, reason: "network" };
  } finally {
    clearTimeout(timer);
  }
}

// OpenCode'un beklediği model girdisi (v1 şeması: name/limit/attachment/...).
export function modelEntry(model: OpenCodeModel): Record<string, unknown> {
  const entry: Record<string, unknown> = { name: model.name };
  if (model.attachment) entry.attachment = true;
  if (model.reasoning) entry.reasoning = true;
  if (model.toolCall) entry.tool_call = true;
  const limit: Record<string, number> = {};
  if (model.context) limit.context = model.context;
  if (model.output) limit.output = model.output;
  if (Object.keys(limit).length > 0) entry.limit = limit;
  return entry;
}

export function providerConfig(models: OpenCodeModel[]): Record<string, unknown> {
  const modelMap: Record<string, unknown> = {};
  for (const model of models) modelMap[model.id] = modelEntry(model);
  return {
    npm: OPENCODE_NPM,
    name: "WenOX",
    options: {
      baseURL: API_BASE_URL.replace(/\/+$/, ""),
      apiKey: keyFileReference(),
    },
    models: modelMap,
  };
}

// Mevcut yapılandırmayı koruyarak yalnızca provider.wenox'u yazar.
export function mergeProvider(
  existing: unknown,
  provider: Record<string, unknown>,
): Record<string, unknown> {
  const base = asRecord(existing) ? { ...(existing as Record<string, unknown>) } : {};
  const providers = asRecord(base.provider) ? { ...(base.provider as Record<string, unknown>) } : {};
  providers[OPENCODE_PROVIDER_ID] = provider;
  base.provider = providers;
  return base;
}

// Senkronizasyon: yalnızca model listesi tazelenir. Kullanıcı `provider.wenox`
// altında başka bir şey özelleştirdiyse (ör. headers) o korunur; eksik temel
// alanlar tamamlanır.
export function mergeModels(
  existingProvider: unknown,
  models: OpenCodeModel[],
): Record<string, unknown> {
  const base = asRecord(existingProvider) ? { ...(existingProvider as Record<string, unknown>) } : {};
  if (typeof base.npm !== "string") base.npm = OPENCODE_NPM;
  if (typeof base.name !== "string") base.name = "WenOX";
  if (!asRecord(base.options)) {
    base.options = {
      baseURL: API_BASE_URL.replace(/\/+$/, ""),
      apiKey: keyFileReference(),
    };
  }
  const modelMap: Record<string, unknown> = {};
  for (const model of models) modelMap[model.id] = modelEntry(model);
  base.models = modelMap;
  return base;
}

// Yalnızca provider.wenox'u kaldırır; başka sağlayıcı kalmazsa provider alanı silinir.
export function removeProvider(existing: unknown): {
  config: Record<string, unknown>;
  removed: boolean;
} {
  const base = asRecord(existing) ? { ...(existing as Record<string, unknown>) } : {};
  const providers = asRecord(base.provider) ? { ...(base.provider as Record<string, unknown>) } : {};
  const removed = Object.prototype.hasOwnProperty.call(providers, OPENCODE_PROVIDER_ID);
  delete providers[OPENCODE_PROVIDER_ID];
  if (Object.keys(providers).length === 0) delete base.provider;
  else base.provider = providers;
  return { config: base, removed };
}

export type ConfigRead =
  | { ok: true; exists: boolean; config: unknown }
  | { ok: false; message: string };

// Geçersiz JSON'u ASLA ezmeyiz: okunamıyorsa hata döner, yazma yapılmaz.
export function readConfig(file = opencodeConfigPath()): ConfigRead {
  if (!fs.existsSync(file)) return { ok: true, exists: false, config: null };
  try {
    return { ok: true, exists: true, config: JSON.parse(fs.readFileSync(file, "utf8")) };
  } catch (error) {
    return { ok: false, message: String((error as Error)?.message ?? error) };
  }
}

export function writeConfig(config: Record<string, unknown>, file = opencodeConfigPath()): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
}

// Anahtarı ayrı dosyaya yazar (yalnızca sahibi okuyabilir).
export function writeKeyFile(apiKey: string, file = keyFilePath()): void {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  fs.writeFileSync(file, `${apiKey.trim()}\n`, { encoding: "utf8", mode: 0o600 });
}
