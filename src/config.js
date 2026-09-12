import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { t } from "./i18n/index.js";

export const API_BASE_URL =
  process.env.WENOX_API_BASE_URL || "https://api.WenOX.co/v1";

export const API_KEY_URL =
  process.env.WENOX_API_KEY_URL || "https://me.wenox.co/api-key";

export function configDir() {
  return process.env.WENOX_HOME || path.join(os.homedir(), ".wenox");
}

export function configFile() {
  return path.join(configDir(), "config.json");
}

export const AVAILABLE_MODELS = {
  1: { id: "grok-4.6", name: "Grok 4.6" },
  2: { id: "z-ai/glm-5.3-flash", name: "GLM 5.3 Flash" },
  3: { id: "big-pickle", name: "Big Pickle" },
};

export const DEFAULT_MODEL_ID = "grok-4.6";

export const CONTEXT_WINDOW = Number(process.env.WENOX_CONTEXT_WINDOW) || 128_000;

export function getModelInfo(modelIdOrKey) {
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

export function loadConfig() {
  let data = {};
  try {
    const file = configFile();
    if (fs.existsSync(file)) {
      data = JSON.parse(fs.readFileSync(file, "utf8"));
    }
  } catch {
    data = {};
  }

  const apiKey = (process.env.WENOX_API_KEY || data.apiKey || "").trim();
  const currentModel = (
    process.env.WENOX_DEFAULT_MODEL ||
    data.currentModel ||
    DEFAULT_MODEL_ID
  ).trim();
  const language = String(data.language || "").trim();

  return { apiKey, currentModel, language, apiBaseUrl: API_BASE_URL };
}

export function saveConfig({ apiKey, currentModel, language } = {}) {
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

export function maskKey(key) {
  if (!key || key.length <= 10) return "***";
  return `${key.slice(0, 6)}...${key.slice(-4)}`;
}
