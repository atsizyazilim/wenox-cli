import fs from "node:fs";
import path from "node:path";
import { configDir } from "./config.js";

// Komut geçmişi diske yazılır: hem oturumlar arası kalır hem de sıklık bilgisi
// birikir. Ok tuşları kronolojik gezer; yazı yazarken yukarı ok, yazılanla
// başlayan geçmişi sıklık+yenilik (frecency) sırasına göre getirir.

export interface HistoryEntry {
  text: string;
  count: number;
  at: number;
}

const MAX_ENTRIES = 200;
const HALF_LIFE_MS = 1000 * 60 * 60 * 24 * 7; // bir hafta

function historyFile(): string {
  return path.join(configDir(), "history.json");
}

function isEntry(value: unknown): value is HistoryEntry {
  const entry = value as HistoryEntry | null;
  return (
    typeof entry?.text === "string" &&
    entry.text.trim().length > 0 &&
    typeof entry.count === "number" &&
    typeof entry.at === "number"
  );
}

export function loadHistory(): HistoryEntry[] {
  try {
    const raw: unknown = JSON.parse(fs.readFileSync(historyFile(), "utf8"));
    if (!Array.isArray(raw)) return [];
    return raw.filter(isEntry).slice(0, MAX_ENTRIES);
  } catch {
    return [];
  }
}

export function saveHistory(entries: HistoryEntry[]): void {
  try {
    fs.mkdirSync(configDir(), { recursive: true });
    fs.writeFileSync(historyFile(), JSON.stringify(entries.slice(0, MAX_ENTRIES), null, 2), "utf8");
  } catch {
    // geçmiş yazılamasa da oturum devam etmeli
  }
}

// Aynı metin tekrar kullanıldığında kayıt çoğalmak yerine sayacı artar.
export function addHistoryEntry(
  entries: HistoryEntry[],
  text: string,
  now = Date.now(),
): HistoryEntry[] {
  const trimmed = text.trim();
  if (!trimmed) return entries;
  const existing = entries.find((entry) => entry.text === trimmed);
  const rest = entries.filter((entry) => entry.text !== trimmed);
  const next: HistoryEntry = existing
    ? { text: trimmed, count: existing.count + 1, at: now }
    : { text: trimmed, count: 1, at: now };
  return [next, ...rest].slice(0, MAX_ENTRIES);
}

// Sıklık + yenilik: son kullanıma göre üstel azalma, kullanım sayısıyla çarpılır.
export function frecency(entry: HistoryEntry, now = Date.now()): number {
  const age = Math.max(0, now - entry.at);
  return entry.count * Math.pow(0.5, age / HALF_LIFE_MS);
}

export function searchHistory(
  entries: HistoryEntry[],
  prefix: string,
  now = Date.now(),
): HistoryEntry[] {
  const query = prefix.trim().toLowerCase();
  if (!query) return [];
  return entries
    .filter((entry) => entry.text.toLowerCase().startsWith(query))
    .sort((a, b) => frecency(b, now) - frecency(a, now));
}
