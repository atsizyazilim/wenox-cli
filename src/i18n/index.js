import tr from "./tr.js";
import en from "./en.js";

const DICTS = { tr, en };

export const DEFAULT_LANGUAGE = "en";

export const LANGUAGES = [
  { code: "tr", label: "Türkçe" },
  { code: "en", label: "English" },
];

let current = DEFAULT_LANGUAGE;

export function isSupported(code) {
  return Object.prototype.hasOwnProperty.call(DICTS, code);
}

export function normalizeLanguage(value) {
  const code = String(value ?? "").trim().toLowerCase().slice(0, 2);
  return isSupported(code) ? code : null;
}

export function detectLanguage(saved) {
  return (
    normalizeLanguage(process.env.WENOX_LANG) ||
    normalizeLanguage(saved) ||
    normalizeLanguage(Intl.DateTimeFormat().resolvedOptions().locale) ||
    DEFAULT_LANGUAGE
  );
}

export function setLocale(code) {
  const next = normalizeLanguage(code);
  if (next) current = next;
  return current;
}

export function getLocale() {
  return current;
}

export function localeTag() {
  return current === "tr" ? "tr-TR" : "en-US";
}

function resolve(dict, key) {
  return key.split(".").reduce((node, part) => {
    if (node && typeof node === "object") return node[part];
    return undefined;
  }, dict);
}

function interpolate(value, params) {
  if (typeof value !== "string" || !params) return value;
  return value.replace(/\{(\w+)\}/g, (match, name) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match,
  );
}

export function t(key, params) {
  const value = resolve(DICTS[current], key) ?? resolve(DICTS[DEFAULT_LANGUAGE], key);
  if (value === undefined) return key;
  return interpolate(value, params);
}
