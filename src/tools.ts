import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { createPatch } from "diff";
import { resolvePath, errorProp } from "./utils.js";
import { codeIntel } from "./lsp.js";
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

const SYNC_TOOLS: Record<string, SyncToolHandler> = {
  read_file: (args) => readFile(args.path, args.start_line, args.end_line),
  write_file: (args) => writeFile(args.path, args.content),
  edit_file: (args) => editFile(args.path, args.target, args.replacement),
  list_dir: (args) => listDir(args.path ?? ".", args.max_depth ?? 2),
  search_code: (args) => searchCode(args.query, args.path ?? ".", args.is_regex ?? false),
};

export async function executeTool(
  name: string,
  args: ToolArgs = {},
): Promise<ToolResult> {
  try {
    if (name === "ask_user") {
      return { success: false, error: "ask_user can only be run through the interface." };
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
      description: "Creates a new file or overwrites the entire contents of an existing file.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Path of the file to write" },
          content: { type: "string", description: "Full text content to write to the file" },
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
        "Replaces a specific code block (target) in a file with a new code block (replacement). Provides safe, surgical edits.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Path of the file to edit" },
          target: {
            type: "string",
            description: "The exact, unique existing code block to be replaced",
          },
          replacement: { type: "string", description: "The new code block to insert" },
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
];
