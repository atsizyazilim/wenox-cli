import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import stripAnsi from "strip-ansi";
import stringWidth from "string-width";

// Bu yardımcılar çalışma zamanında da savunmacı (`String(x ?? "")`), bu yüzden
// metin parametreleri gevşek tipleniyor: çağrı yerlerini kırmadan gerçek
// davranışı yansıtsın.
type MaybeText = string | null | undefined;

export function plain(text: MaybeText): string {
  return stripAnsi(String(text ?? ""));
}

export function textWidth(text: MaybeText): number {
  return stringWidth(plain(text));
}

export function padTo(text: string, width: number): string {
  const current = textWidth(text);
  if (current >= width) return text;
  return text + " ".repeat(width - current);
}

export function sliceByWidth(text: MaybeText, from: number, to: number): string {
  const source = plain(text);
  let column = 0;
  let out = "";
  for (const char of source) {
    const width = stringWidth(char);
    const next = column + width;
    if (next <= from) {
      column = next;
      continue;
    }
    if (column >= to) break;
    out += char;
    column = next;
  }
  return out;
}

export function openUrl(url: MaybeText): boolean {
  const target = String(url ?? "").trim();
  if (!/^https?:\/\//i.test(target)) return false;
  try {
    const platform = process.platform;
    const [command, args] =
      platform === "win32"
        ? ["cmd", ["/c", "start", "", target]]
        : platform === "darwin"
          ? ["open", [target]]
          : ["xdg-open", [target]];
    const child = spawn(command, args, { detached: true, stdio: "ignore" });
    child.on("error", () => {});
    child.unref();
    return true;
  } catch {
    return false;
  }
}

// Araç argümanları doğrulanmamış geldiği için `unknown` kabul ediyor.
export function resolvePath(input: unknown): string {
  let clean = String(input ?? "").replace(/\\/g, "/");

  if (clean === "/tmp" || clean.startsWith("/tmp/")) {
    const rel = clean === "/tmp" ? "" : clean.slice(5);
    const tmp = os.tmpdir();
    return rel ? path.resolve(tmp, rel) : path.resolve(tmp);
  }

  if (clean.startsWith("~")) {
    clean = path.join(os.homedir(), clean.slice(1));
  }

  const native = clean.split("/").join(path.sep);
  if (!path.isAbsolute(native)) {
    return path.resolve(process.cwd(), native);
  }
  return path.resolve(native);
}

// package.json'ı verilen dizinden yukarı doğru arar. Derinliğe bağlı olmadığı için
// kaynak ağacında (src/), derlenmiş çıktıda (dist/src/) ve global kurulumda aynı çalışır.
export function findPackageJson(
  startDir: MaybeText,
  expectedName?: string,
): string | null {
  let dir = path.resolve(String(startDir ?? "."));
  for (;;) {
    const candidate = path.join(dir, "package.json");
    if (fs.existsSync(candidate)) {
      if (!expectedName) return candidate;
      try {
        const parsed = JSON.parse(fs.readFileSync(candidate, "utf8"));
        if (parsed && parsed.name === expectedName) return candidate;
      } catch {
        // bozuk manifest: yukarı devam
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export function formatBytes(bytes: number | string | null | undefined): string {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = n / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value.toFixed(1)} ${units[i]}`;
}

// Fırlatılan değer Error olmak zorunda değil; eski kod `error?.name` /
// `error?.message` diye doğrudan okuyordu, aynı erişim korunuyor.
export function errorProp(error: unknown, key: string): unknown {
  return error && typeof error === "object"
    ? (error as Record<string, unknown>)[key]
    : undefined;
}

export function truncate(text: MaybeText, maxLength: number): string {
  const s = String(text ?? "");
  return s.length <= maxLength ? s : `${s.slice(0, maxLength - 1)}…`;
}

const GARBAGE_PATTERNS: RegExp[] = [
  /(?:\b\d{7,8}\b[ \t]*){4,}/g,
  /(?:\b[01]{7,8}\b[ \t]*){4,}/g,
  /\b[01]{5,}(?:[ \t]+[01]{5,})+\b/g,
  /\b\d{7,8}(?:[ \t]+\d{7,8})+\b/g,
  /[01]{25,}/g,
  /\((?:UTF-8|ASCII)[^)]*\)/gi,
];

export function sanitizeOutput(text: MaybeText): string {
  if (!text) return "";
  let out = String(text);
  for (const pattern of GARBAGE_PATTERNS) {
    out = out.replace(pattern, " ");
  }
  return out.trim();
}
