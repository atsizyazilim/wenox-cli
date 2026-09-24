import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { createPatch } from "diff";
import { resolvePath, errorProp } from "./utils.js";
import { codeIntel, fileDiagnostics } from "./lsp.js";
import type { FileDiagnostic } from "./lsp.js";
import type { CodeIntelResult, LocationEntry, SymbolEntry } from "./lsp.js";
import { setAbortHandler, clearAbortHandler } from "./cancel.js";

const IGNORED_DIRS = new Set([
  ".git", ".svn", "__pycache__", "node_modules", "venv", ".venv", ".idea",
  ".vscode", ".vs", "x64", "x86", "Win32", "Debug", "Release", "obj", "bin",
  "Intermediate", "ipch", "dist", "build",
]);

const IGNORED_EXTENSIONS = new Set([
  ".obj", ".pdb", ".tlog", ".idb", ".ilk", ".suo", ".user", ".lastbuildstate",
  ".pyc", ".pyo", ".tmp",
]);

const BINARY_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".ico", ".exe", ".dll", ".bin",
  ".pyc", ".pdf", ".zip", ".tar", ".gz", ".rar", ".7z", ".mp3", ".mp4",
  ".woff", ".woff2", ".ttf", ".otf", ".so", ".dylib",
]);

const READ_ENCODINGS = ["utf-8", "windows-1254", "windows-1252"];
const DEFAULT_MAX_VIEW = 300;
const MAX_ITEMS = 80;
const MAX_MATCHES = 50;
const COMMAND_TIMEOUT_MS = 120_000;

// Araç argümanları modelden doğrulanmamış JSON olarak geliyor; alanlar
// TOOLS_SCHEMA'nın bildirdiği tiplerle yazılıyor, okuma ise yine savunmacı
// (varsayılanlar çağrı yerinde). Index signature, indekslenebilir kalsın diye.
export interface ToolArgs {
  path?: string;
  content?: string;
  target?: string;
  replacement?: string;
  query?: string;
  command?: string;
  operation?: string;
  question?: string;
  options?: unknown;
  start_line?: number;
  end_line?: number;
  max_depth?: number;
  is_regex?: boolean;
  line?: number;
  character?: number;
  todos?: unknown;
  pattern?: string;
  url?: string;
  [key: string]: unknown;
}

export interface ToolListItem {
  name: string;
  type: string;
  size_bytes?: number;
}

export interface ToolMatch {
  file: string;
  line_number: number;
  line_content: string;
}

export interface ToolResult {
  success: boolean;
  error?: string;
  path?: string;
  content?: string;
  total_lines?: number;
  viewing_range?: string;
  lines_written?: number;
  chars_written?: number;
  message?: string;
  diff?: string;
  base_path?: string;
  total_items?: number;
  items?: ToolListItem[];
  query?: string;
  match_count?: number;
  matches?: ToolMatch[];
  returncode?: number;
  stdout?: string;
  stderr?: string;
  new_directory?: string;
  sample_files?: string[];
  operation?: string;
  count?: number;
  symbols?: SymbolEntry[];
  hover?: string;
  locations?: LocationEntry[];
  question?: string;
  answer?: string;
  // Düzenleme sonrası dil sunucusunun bildirdiği hatalar/uyarılar.
  diagnostics?: FileDiagnostic[];
}

// Fırlatılan değer Error olmak zorunda değil; eski kod `${error.message}`
// yazıyordu, aynı metin üretiliyor.
const errText = (error: unknown): string => String(errorProp(error, "message"));

function readTextFile(filePath: string): { text: string; encoding: string } {
  const buffer = fs.readFileSync(filePath);
  for (const encoding of READ_ENCODINGS) {
    try {
      const text = new TextDecoder(encoding, { fatal: true }).decode(buffer);
      return { text: text.replace(/^﻿/, ""), encoding };
    } catch {
      // try the next encoding
    }
  }
  return { text: buffer.toString("latin1"), encoding: "latin1" };
}

function writeTextFile(filePath: string, text: string, encoding: string): void {
  if (encoding === "utf-8") {
    fs.writeFileSync(filePath, text, "utf8");
  } else {
    fs.writeFileSync(filePath, Buffer.from(text, "latin1"));
  }
}

function cleanLineNumbers(text: string): string {
  const lines = text.split("\n");
  const pattern = /^\s*\d+\s*\|\s?/;
  if (lines.some((line) => line.trim() && pattern.test(line))) {
    return lines.map((line) => line.replace(pattern, "")).join("\n");
  }
  return text;
}

function walkDirectory(
  baseDir: string,
  maxDepth: number,
  visit: (fullPath: string, type: "file" | "directory") => void,
): void {
  const visitLevel = (dir: string, depth: number): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    const dirs: string[] = [];
    const files: string[] = [];
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (IGNORED_DIRS.has(entry.name) || entry.name.startsWith(".")) continue;
        dirs.push(entry.name);
      } else if (entry.isFile()) {
        if (IGNORED_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue;
        files.push(entry.name);
      }
    }

    files.sort();
    dirs.sort();

    for (const name of files) {
      visit(path.join(dir, name), "file");
    }

    if (depth >= maxDepth) return;
    for (const name of dirs) {
      const full = path.join(dir, name);
      visit(full, "directory");
      visitLevel(full, depth + 1);
    }
  };

  visitLevel(baseDir, 0);
}

export function readFile(
  pathArg: unknown,
  startLine: unknown = null,
  endLine: unknown = null,
): ToolResult {
  const filePath = resolvePath(pathArg);
  if (!fs.existsSync(filePath)) {
    return { success: false, error: `File not found: ${String(pathArg)}` };
  }
  if (fs.statSync(filePath).isDirectory()) {
    return { success: false, error: `'${String(pathArg)}' is a directory, not a file.` };
  }

  let text: string;
  try {
    text = readTextFile(filePath).text;
  } catch (error) {
    return { success: false, error: `Could not read file as text: ${errText(error)}` };
  }

  const lines = text.split("\n");
  const total = lines.length;
  const start = startLine ? Math.max(1, Number(startLine)) : 1;
  const end = endLine
    ? Math.min(total, Number(endLine))
    : Math.min(total, start + DEFAULT_MAX_VIEW - 1);

  if (start > total) {
    return {
      success: true,
      path: filePath,
      total_lines: total,
      content: `[File has ${total} lines. Line ${start} does not exist.]`,
    };
  }

  const numbered: string[] = [];
  for (let i = start; i <= end; i += 1) {
    numbered.push(`${String(i).padStart(5)} | ${lines[i - 1]}`);
  }
  let content = numbered.join("\n");
  if (end < total) {
    content += `\n[... File has ${total} lines total. Showing lines ${start}-${end}. To continue, read with the start_line=${
      end + 1
    } parameter ...]`;
  }

  return {
    success: true,
    path: filePath,
    total_lines: total,
    viewing_range: `${start}-${end}`,
    content,
  };
}

export function writeFile(pathArg: unknown, content: unknown = ""): ToolResult {
  const filePath = resolvePath(pathArg);
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, String(content ?? ""), "utf8");
    return {
      success: true,
      path: filePath,
      lines_written: String(content ?? "").split("\n").length,
      chars_written: String(content ?? "").length,
      message: `'${path.basename(filePath)}' saved successfully.`,
    };
  } catch (error) {
    return { success: false, error: `Could not write file: ${errText(error)}` };
  }
}

export function editFile(
  pathArg: unknown,
  target: unknown = "",
  replacement: unknown = "",
): ToolResult {
  const filePath = resolvePath(pathArg);
  if (!fs.existsSync(filePath)) {
    return { success: false, error: `File not found: ${String(pathArg)}` };
  }
  if (!fs.statSync(filePath).isFile()) {
    return { success: false, error: `'${String(pathArg)}' is not a file.` };
  }

  let originalContent: string;
  let encoding: string;
  try {
    const read = readTextFile(filePath);
    originalContent = read.text;
    encoding = read.encoding;
  } catch (error) {
    return { success: false, error: `Could not open file: ${errText(error)}` };
  }

  const normOrig = originalContent.replace(/\r\n/g, "\n");
  const normTarget = cleanLineNumbers(String(target).replace(/\r\n/g, "\n"));
  const normReplacement = cleanLineNumbers(String(replacement).replace(/\r\n/g, "\n"));

  let newContent: string | null = null;

  const occurrences = normOrig.split(normTarget).length - 1;
  if (occurrences === 1) {
    newContent = normOrig.replace(normTarget, () => normReplacement);
  } else if (occurrences > 1) {
    return {
      success: false,
      error: `Target text was found ${occurrences} times in the file. Include a few surrounding lines in the target to make the change unique.`,
    };
  } else {
    const origLines = normOrig.split("\n");
    const targetLines = normTarget.split("\n");
    const targetLen = targetLines.length;
    const targetRstrip = targetLines.map((line) => line.replace(/\s+$/, ""));

    const matches: number[] = [];
    for (let i = 0; i <= origLines.length - targetLen; i += 1) {
      let allMatch = true;
      for (let j = 0; j < targetLen; j += 1) {
        if (origLines[i + j].replace(/\s+$/, "") !== targetRstrip[j]) {
          allMatch = false;
          break;
        }
      }
      if (allMatch) matches.push(i);
    }

    if (matches.length === 1) {
      const startIdx = matches[0];
      const replLines = normReplacement.split("\n");
      newContent = [
        ...origLines.slice(0, startIdx),
        ...replLines,
        ...origLines.slice(startIdx + targetLen),
      ].join("\n");
    } else if (matches.length > 1) {
      return {
        success: false,
        error: `Target text matches ${matches.length} places in the file. Please add more distinctive surrounding lines.`,
      };
    } else {
      const targetTrimmed = targetLines.map((line) => line.trim()).filter(Boolean);
      if (targetTrimmed.length > 0) {
        const looseMatches: [number, number][] = [];
        for (let i = 0; i < origLines.length; i += 1) {
          let sub = 0;
          for (let k = i; k < origLines.length; k += 1) {
            if (!origLines[k].trim()) continue;
            if (origLines[k].trim() === targetTrimmed[sub]) {
              sub += 1;
              if (sub === targetTrimmed.length) {
                looseMatches.push([i, k + 1]);
                break;
              }
            } else {
              break;
            }
          }
        }
        if (looseMatches.length === 1) {
          const [startIdx, endIdx] = looseMatches[0];
          const replLines = normReplacement.split("\n");
          newContent = [
            ...origLines.slice(0, startIdx),
            ...replLines,
            ...origLines.slice(endIdx),
          ].join("\n");
        }
      }
    }
  }

  if (newContent === null) {
    return {
      success: false,
      error:
        "Target text was not found in the file. Use 'read_file' to inspect the current file content and set the target correctly.",
    };
  }

  const finalContent = originalContent.includes("\r\n")
    ? newContent.replace(/\n/g, "\r\n")
    : newContent;

  try {
    writeTextFile(filePath, finalContent, encoding);
  } catch (error) {
    return { success: false, error: `Could not write file: ${errText(error)}` };
  }

  const patch = createPatch(
    path.basename(filePath),
    originalContent,
    finalContent,
    "",
    "",
    { context: 3 },
  );
  const diff = patch.split("\n").slice(1).join("\n").replace(/^\n+/, "");

  return {
    success: true,
    path: filePath,
    diff: diff.endsWith("\n") ? diff : `${diff}\n`,
    message: `'${path.basename(filePath)}' updated successfully.`,
  };
}

export function listDir(pathArg: unknown = ".", maxDepth: unknown = 2): ToolResult {
  const targetDir = resolvePath(pathArg);
  if (!fs.existsSync(targetDir)) {
    return { success: false, error: `Directory not found: ${String(pathArg)}` };
  }
  if (!fs.statSync(targetDir).isDirectory()) {
    return { success: false, error: `'${String(pathArg)}' is not a directory.` };
  }

  const items: ToolListItem[] = [];
  walkDirectory(targetDir, Number(maxDepth) || 2, (fullPath, type) => {
    const rel = path.relative(targetDir, fullPath);
    if (type === "directory") {
      items.push({ name: rel, type: "directory" });
      return;
    }
    let size = 0;
    try {
      size = fs.statSync(fullPath).size;
    } catch {
      size = 0;
    }
    items.push({ name: rel, type: "file", size_bytes: size });
  });

  return {
    success: true,
    base_path: targetDir,
    total_items: items.length,
    items: items.slice(0, MAX_ITEMS),
  };
}

// `**` her derinliği, `*` tek yol parçasını, `?` tek karakteri, `{a,b}` seçenek
// listesini eşler. Desende `/` yoksa her derinlikte aranır (`**/` eklenir).
const MAX_GLOB_RESULTS = 200;

function globToRegExp(pattern: string): RegExp | null {
  const source = pattern.includes("/") ? pattern : `**/${pattern}`;
  let out = "";
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (char === "*") {
      if (source[i + 1] === "*") {
        i += 1;
        if (source[i + 1] === "/") {
          i += 1;
          out += "(?:[^/]*/)*";
        } else {
          out += ".*";
        }
      } else {
        out += "[^/]*";
      }
      continue;
    }
    if (char === "?") {
      out += "[^/]";
      continue;
    }
    if (char === "{") {
      const close = source.indexOf("}", i);
      if (close !== -1) {
        const options = source.slice(i + 1, close).split(",");
        out += `(?:${options.map((option) => escapeRegExp(option)).join("|")})`;
        i = close;
        continue;
      }
    }
    out += escapeRegExp(char);
  }
  try {
    return new RegExp(`^${out}$`, "i");
  } catch {
    return null;
  }
}

export function globFiles(pattern: unknown, pathArg: unknown = "."): ToolResult {
  const raw = String(pattern ?? "").trim();
  if (!raw) return { success: false, error: "Pattern cannot be empty." };

  const matcher = globToRegExp(raw);
  if (!matcher) return { success: false, error: `Invalid pattern: ${raw}` };

  const targetDir = resolvePath(pathArg);
  if (!fs.existsSync(targetDir)) {
    return { success: false, error: `Path not found: ${String(pathArg)}` };
  }
  const root = fs.statSync(targetDir).isDirectory() ? targetDir : path.dirname(targetDir);

  const found: { relative: string; mtime: number }[] = [];
  walkDirectory(root, 99, (fullPath, type) => {
    if (type !== "file" || found.length >= MAX_GLOB_RESULTS * 5) return;
    const relative = path.relative(root, fullPath).split(path.sep).join("/");
    if (!matcher.test(relative)) return;
    let mtime = 0;
    try {
      mtime = fs.statSync(fullPath).mtimeMs;
    } catch {
      // zaman okunamazsa sıralamada en sona düşer
    }
    found.push({ relative, mtime });
  });

  // En son değişenler önce (opencode'daki glob da böyle sıralıyor).
  found.sort((a, b) => b.mtime - a.mtime);
  const items: ToolListItem[] = found.slice(0, MAX_GLOB_RESULTS).map((entry) => ({
    name: entry.relative,
    type: "file",
  }));

  return { success: true, count: items.length, base_path: root, items };
}

export function searchCode(
  query: unknown,
  pathArg: unknown = ".",
  isRegex: unknown = false,
): ToolResult {
  const targetDir = resolvePath(pathArg);
  if (!fs.existsSync(targetDir)) {
    return { success: false, error: `Search path not found: ${String(pathArg)}` };
  }
  if (!query) {
    return { success: false, error: "Search query cannot be empty." };
  }

  let pattern: RegExp;
  try {
    pattern = new RegExp(isRegex ? String(query) : escapeRegExp(String(query)), "i");
  } catch (error) {
    return { success: false, error: `Invalid search pattern: ${errText(error)}` };
  }

  const matches: ToolMatch[] = [];
  const root = fs.statSync(targetDir).isDirectory() ? targetDir : path.dirname(targetDir);

  walkDirectory(root, 99, (fullPath, type) => {
    if (matches.length >= MAX_MATCHES) return;
    if (type !== "file") return;
    if (BINARY_EXTENSIONS.has(path.extname(fullPath).toLowerCase())) return;

    let content: string;
    try {
      content = fs.readFileSync(fullPath, "utf8");
    } catch {
      return;
    }

    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i += 1) {
      if (pattern.test(lines[i])) {
        matches.push({
          file: path.relative(root, fullPath),
          line_number: i + 1,
          line_content: lines[i].trim().slice(0, 200),
        });
        if (matches.length >= MAX_MATCHES) break;
      }
    }
  });

  return {
    success: true,
    query: String(query),
    match_count: matches.length,
    matches,
  };
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Alt süreçleriyle birlikte öldür (Windows'ta taskkill /T, POSIX'te SIGTERM)
function killProcessTree(child: ChildProcess | null): void {
  if (!child || child.exitCode !== null || child.pid == null) return;
  try {
    if (process.platform === "win32") {
      spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
        stdio: "ignore",
        windowsHide: true,
      });
    } else {
      child.kill("SIGTERM");
    }
  } catch {
    // yoksay
  }
}

// CLI'ın kendisi Node ile çalışır. Tüm node süreçlerini öldüren komutlar
// CLI'ı da öldürür (terminali bozuk bırakır) — bunları reddet.
export function killsOwnProcess(command: unknown): string | null {
  const cmd = String(command ?? "").toLowerCase();
  if (!cmd.trim()) return null;

  if (/\btaskkill\b/.test(cmd) && /\/im\s+["']?node(js)?(\.exe)?\b/.test(cmd)) {
    return "taskkill /IM node";
  }
  if (/\bstop-process\b/.test(cmd) && /(-name\s+["']?node|get-process\s+["']?node)/.test(cmd)) {
    return "Stop-Process node";
  }
  if (/\b(pkill|killall)\b/.test(cmd) && /\bnode(js)?\b/.test(cmd)) return "pkill/killall node";
  if (/\bkill\b[^|;&]*\s(?:-\d+\s+)*-1(?!\d)/.test(cmd)) return "kill -1 (all processes)";

  const self = String(process.pid);
  const pidArgs = [...cmd.matchAll(/(?:\/pid|--pid)\s+([\d\s]+)/g)].flatMap((match) =>
    match[1].trim().split(/\s+/),
  );
  if (pidArgs.includes(self)) return `targets pid ${self}`;
  if (new RegExp(`\\bkill\\b[^|;&]*\\b${self}\\b`).test(cmd)) return `kill ${self}`;

  return null;
}

// --- webfetch: bir URL'yi indirip modele okunur metin olarak verir ---------

const WEB_TIMEOUT_MS = 20_000;
const WEB_MAX_BYTES = 2 * 1024 * 1024;
const WEB_MAX_CHARS = 40_000;

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (match, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? match);
}

// Kaba ama yeterli bir HTML -> metin dönüşümü: script/style atılır, blok
// etiketleri satır sonuna çevrilir, kalan etiketler silinir.
export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/<\/(p|div|section|article|li|tr|h[1-6]|pre|blockquote)>/gi, "\n")
      .replace(/<(br|hr)\s*\/?>/gi, "\n")
      .replace(/<li[^>]*>/gi, "- ")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export async function webFetch(urlArg: unknown): Promise<ToolResult> {
  const raw = String(urlArg ?? "").trim();
  if (!raw) return { success: false, error: "URL cannot be empty." };

  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return { success: false, error: `Invalid URL: ${raw}` };
  }
  if (target.protocol !== "http:" && target.protocol !== "https:") {
    return { success: false, error: "Only http:// and https:// URLs can be fetched." };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WEB_TIMEOUT_MS);
  try {
    const response = await fetch(target, {
      signal: controller.signal,
      redirect: "follow",
      headers: { "user-agent": "WenOX-CLI", accept: "text/html,text/plain,application/json,*/*" },
    });
    if (!response.ok) {
      return { success: false, error: `Request failed with status ${response.status}.` };
    }

    const type = response.headers.get("content-type") ?? "";
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > WEB_MAX_BYTES) {
      return { success: false, error: `Response is too large (${buffer.length} bytes).` };
    }

    const body = buffer.toString("utf8");
    const isHtml = /html/i.test(type) || /^\s*<(!doctype|html)/i.test(body);
    let text = isHtml ? htmlToText(body) : body.trim();
    const truncated = text.length > WEB_MAX_CHARS;
    if (truncated) text = `${text.slice(0, WEB_MAX_CHARS)}\n[... truncated ...]`;

    return {
      success: true,
      operation: "webfetch",
      content: text,
      total_lines: text.split("\n").length,
      chars_written: text.length,
      message: `${target.href} (${type || "unknown type"}${truncated ? ", truncated" : ""})`,
    };
  } catch (error) {
    const message = error instanceof Error && error.name === "AbortError" ? "request timed out" : errText(error);
    return { success: false, error: `Could not fetch URL: ${message}` };
  } finally {
    clearTimeout(timer);
  }
}

export function runCommand(command: unknown): Promise<ToolResult> {
  return new Promise((resolve) => {
    if (!command || !String(command).trim()) {
      resolve({ success: false, error: "Command to run cannot be empty." });
      return;
    }

    const selfKill = killsOwnProcess(command);
    if (selfKill) {
      resolve({
        success: false,
        error: `Refused: "${selfKill}" would also terminate the WenOX CLI itself, which runs on Node (pid ${process.pid}). Kill only the exact PID you need and never include pid ${process.pid}.`,
      });
      return;
    }

    let child: ChildProcess;
    try {
      child = spawn(String(command), {
        shell: true,
        cwd: process.cwd(),
        windowsHide: true,
      });
    } catch (error) {
      resolve({ success: false, error: `Could not run command: ${errText(error)}` });
      return;
    }

    let stdout = "";
    let stderr = "";
    let settled = false;
    let cancelled = false;

    const finish = (result: ToolResult): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearAbortHandler();
      resolve(result);
    };

    // ESC / Ctrl+C çalışan komutu da durdurur (ör. açık kalan bir dev server).
    // Süreç hemen ölmese bile beklemeden dön: arayüz takılı kalmasın.
    setAbortHandler(() => {
      cancelled = true;
      killProcessTree(child);
      finish({
        success: false,
        error: "Command cancelled by the user.",
        returncode: -1,
        stdout,
        stderr,
      });
    });

    const timer = setTimeout(() => {
      killProcessTree(child);
      finish({ success: false, error: "Command timed out (120 seconds)." });
    }, COMMAND_TIMEOUT_MS);

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });

    child.on("error", (error) => {
      finish({ success: false, error: `Could not run command: ${errText(error)}` });
    });

    child.on("close", (code) => {
      if (cancelled) {
        finish({
          success: false,
          error: "Command cancelled by the user.",
          returncode: code ?? 0,
          stdout,
          stderr,
        });
        return;
      }
      finish({ success: true, returncode: code ?? 0, stdout, stderr });
    });
  });
}

export function changeDirectory(pathArg: unknown): ToolResult {
  const target = resolvePath(pathArg);
  if (!fs.existsSync(target)) {
    return { success: false, error: `Directory not found: ${String(pathArg)}` };
  }
  if (!fs.statSync(target).isDirectory()) {
    return { success: false, error: `'${String(pathArg)}' is not a directory.` };
  }
  try {
    process.chdir(target);
    const sample = fs
      .readdirSync(target)
      .filter((name) => !IGNORED_DIRS.has(name) && !name.startsWith("."))
      .slice(0, 15);
    return {
      success: true,
      new_directory: process.cwd(),
      sample_files: sample,
      message: `Working directory changed to '${process.cwd()}' successfully.`,
    };
  } catch (error) {
    return { success: false, error: `Could not change directory: ${errText(error)}` };
  }
}

type SyncToolHandler = (args: ToolArgs) => ToolResult;

// Dosya değiştikten sonra dil sunucusuna sorulur; model kendi soktuğu hatayı
// görsün diye sonuç tanılamalarla birlikte döner (sunucu yoksa ek bilgi olmaz).
async function withDiagnostics(result: ToolResult): Promise<ToolResult> {
  if (!result.success || !result.path) return result;
  const diagnostics = await fileDiagnostics(result.path);
  if (!diagnostics || diagnostics.length === 0) return result;
  return { ...result, diagnostics };
}

const SYNC_TOOLS: Record<string, SyncToolHandler> = {
  read_file: (args) => readFile(args.path, args.start_line, args.end_line),
  list_dir: (args) => listDir(args.path ?? ".", args.max_depth ?? 2),
  search_code: (args) => searchCode(args.query, args.path ?? ".", args.is_regex ?? false),
  glob: (args) => globFiles(args.pattern, args.path ?? "."),
};

export async function executeTool(
  name: string,
  args: ToolArgs = {},
): Promise<ToolResult> {
  try {
    if (name === "ask_user") {
      return { success: false, error: "ask_user can only be run through the interface." };
    }
    if (name === "todo_write") {
      return { success: false, error: "todo_write can only be run through the agent." };
    }
    if (name === "webfetch") {
      return await webFetch(args.url);
    }
    if (name === "write_file") {
      return await withDiagnostics(writeFile(args.path, args.content));
    }
    if (name === "edit_file") {
      return await withDiagnostics(editFile(args.path, args.target, args.replacement));
    }
    if (name === "run_command") {
      return await runCommand(args.command);
    }
    if (name === "code_intel") {
      return await codeIntel(args);
    }
    const handler = SYNC_TOOLS[name];
    if (!handler) {
      return { success: false, error: `Unknown tool: ${name}` };
    }
    return handler(args);
  } catch (error) {
    if (error instanceof TypeError) {
      return { success: false, error: `Parameter error: ${errText(error)}` };
    }
    return { success: false, error: `Unexpected error: ${errText(error)}` };
  }
}

export interface ToolSchema {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
}

export const TOOLS_SCHEMA: ToolSchema[] = [
  {
    type: "function",
    function: {
      name: "read_file",
      description:
        "Reads a file's contents with line numbers. Specific line ranges can be read.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Relative or absolute path of the file to read",
          },
          start_line: { type: "integer", description: "Start line number (1-based, optional)" },
          end_line: { type: "integer", description: "End line number (optional)" },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description:
        "Creates a new file or overwrites an existing file. For a long file, write only the first section here (under ~150 lines) and append the remaining sections with edit_file in later calls — never put a whole large file into a single call, because the response gets truncated.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Path of the file to write" },
          content: { type: "string", description: "Text content to write to the file" },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "edit_file",
      description:
        "Replaces a specific code block (target) in a file with a new code block (replacement). Safe, surgical edits. Also the way to append to a file: pass the file's current last line as target, and that same line followed by the new section as replacement.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Path of the file to edit" },
          target: {
            type: "string",
            description: "The exact, unique existing code block to be replaced",
          },
          replacement: {
            type: "string",
            description: "The new code block to insert in place of target",
          },
        },
        required: ["path", "target", "replacement"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_dir",
      description: "Lists files and subdirectories in the given directory.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Directory path to list (default: .)",
            default: ".",
          },
          max_depth: {
            type: "integer",
            description: "Directory depth limit (default: 2)",
            default: 2,
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_code",
      description: "Searches project files for text or a regex pattern.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Word or pattern to search for" },
          path: {
            type: "string",
            description: "Directory to search in (default: .)",
            default: ".",
          },
          is_regex: {
            type: "boolean",
            description: "Whether the query is a regular expression",
            default: false,
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "run_command",
      description:
        "Runs a shell command in the terminal (e.g. running tests, pip install, git commands).",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string", description: "Shell command to run" },
        },
        required: ["command"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "code_intel",
      description:
        "Queries a language server for code intelligence: go to definition, find references, hover type/signature info, or list document symbols. Requires a language server for the file type (typescript-language-server, pyright, gopls, rust-analyzer).",
      parameters: {
        type: "object",
        properties: {
          operation: {
            type: "string",
            enum: ["definition", "references", "hover", "symbols"],
            description: "The code intelligence operation to perform",
          },
          path: { type: "string", description: "Path of the file to analyze" },
          line: {
            type: "integer",
            description: "1-based line number (required for definition, references and hover)",
          },
          character: {
            type: "integer",
            description: "1-based column number (required for definition, references and hover)",
          },
        },
        required: ["operation", "path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "ask_user",
      description:
        "Asks the user a multiple-choice question. Use only when a genuine preference/decision is needed; do not ask needlessly, prefer proceeding with reasonable assumptions. Keep the question short and clear, provide 2-4 options.",
      parameters: {
        type: "object",
        properties: {
          question: { type: "string", description: "The question to ask the user" },
          options: {
            type: "array",
            description: "Options (2-4 items)",
            items: {
              type: "object",
              properties: {
                label: { type: "string", description: "Short label of the option" },
                description: {
                  type: "string",
                  description: "Short description of the option (optional)",
                },
              },
              required: ["label"],
            },
          },
        },
        required: ["question", "options"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "glob",
      description:
        "Finds files by glob pattern (e.g. '**/*.tsx', 'src/**/*.test.ts', '*.json'). Results are ordered by modification time, newest first. Use it to locate files before reading them.",
      parameters: {
        type: "object",
        properties: {
          pattern: {
            type: "string",
            description: "Glob pattern. Without a '/', it matches at any depth.",
          },
          path: {
            type: "string",
            description: "Directory to search in (default: project root)",
          },
        },
        required: ["pattern"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "webfetch",
      description:
        "Downloads a web page or API response and returns its text content. Use it to read documentation, changelogs or issue pages when you need information that is not in the repository.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "Absolute http(s) URL to fetch" },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "todo_write",
      description:
        "Records the task list for a long, multi-step piece of work (building a feature, creating a project, touching many files). Send the FULL list every time; it replaces the previous one. Keep exactly one task in_progress while working on it and mark it completed before moving on. Do NOT use it for questions, small edits, single commands or quick fixes - just do those directly and say what you did.",
      parameters: {
        type: "object",
        properties: {
          todos: {
            type: "array",
            description: "The complete, ordered task list",
            items: {
              type: "object",
              properties: {
                content: { type: "string", description: "Short description of the task" },
                status: {
                  type: "string",
                  enum: ["pending", "in_progress", "completed"],
                  description: "Current state of the task",
                },
              },
              required: ["content", "status"],
            },
          },
        },
        required: ["todos"],
      },
    },
  },
];
