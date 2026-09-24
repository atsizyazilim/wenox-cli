import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { configDir } from "./config.js";

// Projedeki talimat dosyaları (AGENTS.md / CLAUDE.md) sistem prompt'una eklenir:
// kullanıcı bir kez yazsın, her oturumda geçerli olsun. Dosyalar nadiren
// değiştiği için kısa süre önbellekte tutulur.

const FILE_NAMES = ["AGENTS.md", "CLAUDE.md"];
const MAX_CHARS = 20_000;
const MAX_LEVELS = 4;
const CACHE_MS = 5_000;

let cache: { key: string; at: number; text: string } | null = null;

function readIfExists(filePath: string): string | null {
  try {
    if (!fs.statSync(filePath).isFile()) return null;
    const text = fs.readFileSync(filePath, "utf8").trim();
    return text ? text : null;
  } catch {
    return null;
  }
}

function globalFile(): string {
  return path.join(configDir(), "AGENTS.md");
}

// cwd'den yukarı doğru (en fazla birkaç seviye) ve genel yapılandırma
// dizininden talimatlar toplanır; en yakın proje dosyası önce gelir.
export function loadInstructions(cwd: string): string {
  const key = path.resolve(cwd);
  const now = Date.now();
  if (cache && cache.key === key && now - cache.at < CACHE_MS) return cache.text;

  const blocks: string[] = [];
  let dir = path.resolve(cwd);
  const home = path.resolve(os.homedir());
  for (let level = 0; level < MAX_LEVELS; level += 1) {
    for (const name of FILE_NAMES) {
      const text = readIfExists(path.join(dir, name));
      if (text) {
        blocks.push(`# ${path.join(dir, name)}\n${text}`);
        break;
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir || dir === home || parent.length < dir.length - 200) break;
    dir = parent;
  }

  const global = readIfExists(globalFile());
  if (global) blocks.push(`# ${globalFile()}\n${global}`);

  let text = blocks.join("\n\n");
  if (text.length > MAX_CHARS) text = `${text.slice(0, MAX_CHARS)}\n[instructions truncated]`;

  cache = { key, at: now, text };
  return text;
}
