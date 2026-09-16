import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { t } from "./i18n/index.js";

export const API_BASE_URL =
  process.env.WENOX_API_BASE_URL || "https://api.WenOX.co/v1";

export const API_KEY_URL =
  process.env.WENOX_API_KEY_URL || "https://me.wenox.co/api-key";

export function configDir(): string {
  return process.env.WENOX_HOME || path.join(os.homedir(), ".wenox");
}

export function configFile(): string {
  return path.join(configDir(), "config.json");
}

export interface ModelInfo {
  id: string;
  name: string;
  custom?: boolean;
}

export const AVAILABLE_MODELS: Record<string, ModelInfo> = {
  "1": { id: "grok-4.6", name: "Grok 4.6" },
  "2": { id: "z-ai/glm-5.3-flash", name: "GLM 5.3 Flash" },
  "3": { id: "big-pickle", name: "Big Pickle" },
};

export const DEFAULT_MODEL_ID = "grok-4.6";

export const CONTEXT_WINDOW = Number(process.env.WENOX_CONTEXT_WINDOW) || 128_000;

export function getModelInfo(modelIdOrKey: unknown): ModelInfo {
  const key = String(modelIdOrKey ?? "");
  if (Object.prototype.hasOwnProperty.call(AVAILABLE_MODELS, key)) {
    return AVAILABLE_MODELS[key];
  }
  for (const model of Object.values(AVAILABLE_MODELS)) {
    if (model.id === key || model.name.toLowerCase() === key.toLowerCase()) {
      return model;
    }
  }
  return { id: key, name: key || t("models.unknown"), custom: true };
}

export interface Config {
  apiKey: string;
  currentModel: string;
  language: string;
  apiBaseUrl: string;
}

export function loadConfig(): Config {
  let data: Record<string, unknown> = {};
  try {
    const file = configFile();
    if (fs.existsSync(file)) {
      const parsed: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
      if (parsed && typeof parsed === "object") data = parsed as Record<string, unknown>;
    }
  } catch {
    data = {};
  }

  // Bu iki alan eskiden de `String()` ile sarılmıyordu; dosyaya elle sayı
  // yazılmışsa eski davranış korunsun diye daraltma cast ile yapılıyor.
  const apiKey = (
    process.env.WENOX_API_KEY ||
    (data.apiKey as string | undefined) ||
    ""
  ).trim();
  const currentModel = (
    process.env.WENOX_DEFAULT_MODEL ||
    (data.currentModel as string | undefined) ||
    DEFAULT_MODEL_ID
  ).trim();
  const language = String(data.language || "").trim();

  return { apiKey, currentModel, language, apiBaseUrl: API_BASE_URL };
}

export interface SaveConfigInput {
  apiKey?: string | null;
  currentModel?: string | null;
  language?: string | null;
}

export function saveConfig({ apiKey, currentModel, language }: SaveConfigInput = {}): Config {
  const cfg = loadConfig();
  if (apiKey != null) cfg.apiKey = String(apiKey).trim();
  if (currentModel != null) cfg.currentModel = String(currentModel).trim();
  if (language != null) cfg.language = String(language).trim();

  fs.mkdirSync(configDir(), { recursive: true, mode: 0o700 });
  const payload = {
    apiKey: cfg.apiKey,
    currentModel: cfg.currentModel,
    language: cfg.language ?? "",
    apiBaseUrl: API_BASE_URL,
  };
  fs.writeFileSync(configFile(), `${JSON.stringify(payload, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });

  return cfg;
}

export function maskKey(key: string | null | undefined): string {
  if (!key || key.length <= 10) return "***";
  return `${key.slice(0, 6)}...${key.slice(-4)}`;
}
