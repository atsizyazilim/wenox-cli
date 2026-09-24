import fs from "node:fs";
import path from "node:path";
import { configDir } from "./config.js";

// WENOX_DEBUG=1 iken tuş ve iptal olayları ~/.wenox/debug.log dosyasına yazılır.
// Normal kullanımda hiçbir maliyeti yok (ilk satırda çıkıyor).

const enabled = (): boolean => Boolean(process.env.WENOX_DEBUG);

export function debugEnabled(): boolean {
  return enabled();
}

export function debugLog(message: string): void {
  if (!enabled()) return;
  try {
    fs.mkdirSync(configDir(), { recursive: true });
    fs.appendFileSync(path.join(configDir(), "debug.log"), `${Date.now()} ${message}\n`, "utf8");
  } catch {
    // tanı yazılamasa da uygulama devam eder
  }
}
