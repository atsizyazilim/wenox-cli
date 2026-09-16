import tr from "./tr.js";
import en from "./en.js";

// Sözlükler homojen değil: çoğu yaprak metin, bazıları satır listesi
// (`help.optionLines` gibi). Bu yüzden tip elle yazılmıyor, sözlükten türetiliyor.
const DICTS = { tr, en };

export type LanguageCode = keyof typeof DICTS;

export const DEFAULT_LANGUAGE: LanguageCode = "en";

export const LANGUAGES: { code: LanguageCode; label: string }[] = [
  { code: "tr", label: "Türkçe" },
  { code: "en", label: "English" },
];

let current: LanguageCode = DEFAULT_LANGUAGE;

export function isSupported(code: string): code is LanguageCode {
  return Object.prototype.hasOwnProperty.call(DICTS, code);
}

export function normalizeLanguage(value: unknown): LanguageCode | null {
  const code = String(value ?? "").trim().toLowerCase().slice(0, 2);
  return isSupported(code) ? code : null;
}

export function detectLanguage(saved?: unknown): LanguageCode {
  return (
    normalizeLanguage(process.env.WENOX_LANG) ||
    normalizeLanguage(saved) ||
    normalizeLanguage(Intl.DateTimeFormat().resolvedOptions().locale) ||
    DEFAULT_LANGUAGE
  );
}

export function setLocale(code: unknown): LanguageCode {
  const next = normalizeLanguage(code);
  if (next) current = next;
  return current;
}

export function getLocale(): LanguageCode {
  return current;
}

export function localeTag(): string {
  return current === "tr" ? "tr-TR" : "en-US";
}

function resolve(dict: unknown, key: string): unknown {
  return key.split(".").reduce<unknown>((node, part) => {
    if (node && typeof node === "object") return (node as Record<string, unknown>)[part];
    return undefined;
  }, dict);
}

function interpolate(value: unknown, params?: Record<string, unknown>): unknown {
  if (typeof value !== "string" || !params) return value;
  return value.replace(/\{(\w+)\}/g, (match, name) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match,
  );
}

export function t(key: string, params?: Record<string, unknown>): string {
  const value = resolve(DICTS[current], key) ?? resolve(DICTS[DEFAULT_LANGUAGE], key);
  if (value === undefined) return key;
  // `interpolate` metin olmayan değeri olduğu gibi döndürüyor (eski davranış).
  // Yaprak anahtar verildiği sürece sonuç her zaman metin olduğu için burada
  // daraltma yapılıyor; yanlış anahtar verilirse zaten bir hata işareti.
  return interpolate(value, params) as string;
}

// Sözlükteki bazı anahtarlar metin değil satır listesi tutuyor (`boot.steps`
// string[], `help.commandRows` string[][]). `t()` metin döndürdüğü için burada
// daraltılıyor — eksik anahtar davranışı `t()` ile aynı kalıyor.
export function tList(key: string): string[] {
  return t(key) as unknown as string[];
}

export function tRows(key: string): string[][] {
  return t(key) as unknown as string[][];
}
