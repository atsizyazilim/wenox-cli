import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { resolvePath } from "./utils.js";

const REQUEST_TIMEOUT_MS = 20_000;

export interface LspServer {
  exts: string[];
  command: string;
  args: string[];
  languageId: string;
  hint: string;
}

const SERVERS: LspServer[] = [
  {
    exts: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"],
    command: "typescript-language-server",
    args: ["--stdio"],
    languageId: "typescript",
    hint: "npm i -g typescript-language-server typescript",
  },
  {
    exts: [".py"],
    command: "pyright-langserver",
    args: ["--stdio"],
    languageId: "python",
    hint: "npm i -g pyright",
  },
  {
    exts: [".go"],
    command: "gopls",
    args: [],
    languageId: "go",
    hint: "go install golang.org/x/tools/gopls@latest",
  },
  {
    exts: [".rs"],
    command: "rust-analyzer",
    args: [],
    languageId: "rust",
    hint: "rustup component add rust-analyzer",
  },
];

const OPERATIONS = new Set(["definition", "references", "hover", "symbols"]);

export function serverFor(filePath: string): LspServer | null {
  const ext = path.extname(filePath).toLowerCase();
  return SERVERS.find((server) => server.exts.includes(ext)) ?? null;
}

function fileUri(filePath: string): string {
  return pathToFileURL(filePath).href;
}

// Sunucu URI'yi kendi biçimiyle gönderiyor (sürücü harfi küçük, yüzde kodlamalı);
// tanılamaları yol anahtarıyla saklayınca karşılaştırma şaşmıyor.
function diagnosticsKey(target: string): string {
  const filePath = /^file:/i.test(target) ? uriToPath(target) : target;
  const resolved = path.resolve(filePath);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

// Gelen konumlar sunucudan geldiği gibi; bozuk bir URI'de eski davranış
// (girdiyi olduğu gibi döndürmek) korunuyor.
function uriToPath(uri: unknown): string {
  try {
    return fileURLToPath(uri as string);
  } catch {
    return uri as string;
  }
}

interface LspRange {
  start?: { line?: number; character?: number } | null;
}

interface LspLocation {
  targetUri?: string;
  uri?: string;
  targetSelectionRange?: LspRange | null;
  targetRange?: LspRange | null;
  range?: LspRange | null;
}

interface LspSymbol {
  name: string;
  kind: number;
  range?: LspRange | null;
  selectionRange?: LspRange | null;
  location?: { range?: LspRange | null } | null;
  children?: LspSymbol[];
}

interface JsonRpcResponse {
  id?: unknown;
  result?: unknown;
  error?: { message?: string } | null;
  // Sunucudan gelen bildirimler (id'siz): tanılamalar bu yolla düşer.
  method?: string;
  params?: unknown;
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

export interface SymbolEntry {
  name: string;
  kind: number;
  line: number;
}

export interface LocationEntry {
  file: string;
  line: number;
  character: number;
}

// Dil sunucusunun gönderdiği ham tanılamalar (LSP biçimi).
export interface RawDiagnostic {
  range?: { start?: { line?: number; character?: number } };
  severity?: number;
  message?: string;
  source?: string;
}

// Modelin okuyacağı sade biçim.
export interface FileDiagnostic {
  line: number;
  character: number;
  severity: "error" | "warning" | "info" | "hint";
  message: string;
  source?: string;
}

export interface CodeIntelResult {
  success: boolean;
  error?: string;
  operation?: string;
  path?: string;
  count?: number;
  symbols?: SymbolEntry[];
  hover?: string;
  locations?: LocationEntry[];
}

class LspClient {
  readonly server: LspServer;
  child: ChildProcess | null;
  buffer: Buffer;
  version: number;
  nextId: number;
  pending: Map<number, PendingRequest>;
  started: boolean;
  opened: Set<string>;
  starting: Promise<void> | null;
  // Dil sunucusunun bildirdiği son tanılamalar (uri -> liste) ve ne zaman.
  diagnostics: Map<string, RawDiagnostic[]>;
  diagnosticsAt: Map<string, number>;

  constructor(server: LspServer) {
    this.server = server;
    this.child = null;
    this.buffer = Buffer.alloc(0);
    this.version = 1;
    this.nextId = 1;
    this.pending = new Map();
    this.started = false;
    this.opened = new Set();
    this.starting = null;
    this.diagnostics = new Map();
    this.diagnosticsAt = new Map();
  }

  async start(): Promise<void> {
    if (this.started) return;
    if (this.starting) return this.starting;
    this.starting = this.#boot();
    try {
      await this.starting;
    } finally {
      this.starting = null;
    }
  }

  async #boot(): Promise<void> {
    const child = spawn(this.server.command, this.server.args, {
      stdio: ["pipe", "pipe", "pipe"],
      shell: process.platform === "win32",
    });
    this.child = child;
    child.on("error", (error: Error) => this.#failAll(error));
    child.on("exit", () => this.#failAll(new Error("language server exited")));
    child.stdout?.on("data", (chunk: Buffer) => this.#onData(chunk));
    child.stderr?.on("data", () => {});

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("language server start timeout")),
        REQUEST_TIMEOUT_MS,
      );
      child.once("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.once("spawn", () => {
        clearTimeout(timer);
        resolve();
      });
    });

    await this.#request("initialize", {
      processId: process.pid,
      rootUri: fileUri(process.cwd()),
      capabilities: {
        textDocument: {
          definition: {},
          references: {},
          hover: {},
          documentSymbol: {},
          // Bu bildirilmezse bazı sunucular (typescript-language-server)
          // tanılamaları hiç yayınlamıyor.
          publishDiagnostics: { versionSupport: true },
        },
      },
    });
    this.#notify("initialized", {});
    this.started = true;
    process.once("exit", () => this.kill());
  }

  kill(): void {
    try {
      this.#notify("exit", {});
      this.child?.kill();
    } catch {
      // yoksay
    }
    this.child = null;
    this.started = false;
  }

  #send(payload: unknown): void {
    if (!this.child?.stdin?.writable) throw new Error("language server is not running");
    const body = JSON.stringify(payload);
    this.child.stdin.write(`Content-Length: ${Buffer.byteLength(body, "utf8")}\r\n\r\n${body}`);
  }

  #notify(method: string, params?: unknown): void {
    this.#send({ jsonrpc: "2.0", method, params });
  }

  #request(method: string, params?: unknown): Promise<unknown> {
    const id = this.nextId++;
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`language server request timed out: ${method}`));
      }, REQUEST_TIMEOUT_MS);
      this.pending.set(id, { resolve, reject, timer });
      try {
        this.#send({ jsonrpc: "2.0", id, method, params });
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  #dispatch(message: JsonRpcResponse): void {
    if (message.method === "textDocument/publishDiagnostics") {
      const params = message.params as
        | { uri?: string; diagnostics?: RawDiagnostic[] }
        | undefined;
      if (params?.uri) {
        const key = diagnosticsKey(params.uri);
        this.diagnostics.set(key, params.diagnostics ?? []);
        this.diagnosticsAt.set(key, Date.now());
      }
      return;
    }
    if (message.id != null && this.pending.has(message.id as number)) {
      const id = message.id as number;
      const entry = this.pending.get(id);
      this.pending.delete(id);
      if (!entry) return;
      clearTimeout(entry.timer);
      if (message.error) {
        entry.reject(new Error(message.error.message ?? "language server error"));
      } else {
        entry.resolve(message.result);
      }
    }
  }

  #failAll(error: Error): void {
    for (const [, entry] of this.pending) {
      clearTimeout(entry.timer);
      entry.reject(error);
    }
    this.pending.clear();
    this.started = false;
  }

  #onData(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    for (;;) {
      const sep = this.buffer.indexOf("\r\n\r\n");
      if (sep === -1) return;
      const header = this.buffer.subarray(0, sep).toString("ascii");
      const match = /Content-Length:\s*(\d+)/i.exec(header);
      if (!match) {
        this.buffer = this.buffer.subarray(sep + 4);
        continue;
      }
      const length = Number(match[1]);
      const start = sep + 4;
      if (this.buffer.length < start + length) return;
      const body = this.buffer.subarray(start, start + length).toString("utf8");
      this.buffer = this.buffer.subarray(start + length);
      try {
        this.#dispatch(JSON.parse(body) as JsonRpcResponse);
      } catch {
        // bozuk mesajı yoksay
      }
    }
  }

  async openDocument(filePath: string): Promise<string> {
    const uri = fileUri(filePath);
    if (this.opened.has(uri)) return uri;
    const text = fs.readFileSync(filePath, "utf8");
    this.#notify("textDocument/didOpen", {
      textDocument: { uri, languageId: this.server.languageId, version: 1, text },
    });
    this.opened.add(uri);
    return uri;
  }

  // Düzenlemeden sonra sunucudaki kopya tazelenir ve YENİ bir tanı lama
  // bildirimi beklenir. Taze bildirim gelmezse null döner: eski liste "hata yok"
  // sanılmasın.
  async refreshDiagnostics(filePath: string, waitMs: number): Promise<RawDiagnostic[] | null> {
    const uri = fileUri(filePath);
    const key = diagnosticsKey(filePath);
    const changedAt = Date.now();
    const text = fs.readFileSync(filePath, "utf8");
    if (!this.opened.has(uri)) {
      this.#notify("textDocument/didOpen", {
        textDocument: { uri, languageId: this.server.languageId, version: 1, text },
      });
      this.opened.add(uri);
    } else {
      this.version += 1;
      this.#notify("textDocument/didChange", {
        textDocument: { uri, version: this.version },
        contentChanges: [{ text }],
      });
    }

    const deadline = Date.now() + waitMs;
    for (;;) {
      if ((this.diagnosticsAt.get(key) ?? 0) >= changedAt) {
        return this.diagnostics.get(key) ?? [];
      }
      if (Date.now() >= deadline) return null;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  async definition(filePath: string, line: number, character: number): Promise<unknown> {
    const uri = await this.openDocument(filePath);
    return this.#request("textDocument/definition", {
      textDocument: { uri },
      position: { line, character },
    });
  }

  async references(filePath: string, line: number, character: number): Promise<unknown> {
    const uri = await this.openDocument(filePath);
    return this.#request("textDocument/references", {
      textDocument: { uri },
      position: { line, character },
      context: { includeDeclaration: true },
    });
  }

  async hover(filePath: string, line: number, character: number): Promise<unknown> {
    const uri = await this.openDocument(filePath);
    return this.#request("textDocument/hover", {
      textDocument: { uri },
      position: { line, character },
    });
  }

  async symbols(filePath: string): Promise<unknown> {
    const uri = await this.openDocument(filePath);
    return this.#request("textDocument/documentSymbol", { textDocument: { uri } });
  }
}

const clients = new Map<string, LspClient>();

function getClient(server: LspServer): LspClient {
  const key = `${server.command}:${process.cwd()}`;
  let client = clients.get(key);
  if (!client) {
    client = new LspClient(server);
    clients.set(key, client);
  }
  return client;
}

function locationEntry(location: unknown): LocationEntry {
  const entry = (location ?? {}) as LspLocation;
  const target = entry.targetUri ? entry.targetUri : entry.uri;
  const range = entry.targetSelectionRange ?? entry.targetRange ?? entry.range;
  return {
    file: uriToPath(target),
    line: (range?.start?.line ?? 0) + 1,
    character: (range?.start?.character ?? 0) + 1,
  };
}

function flattenSymbols(symbols: unknown, out: SymbolEntry[] = []): SymbolEntry[] {
  for (const symbol of (symbols ?? []) as LspSymbol[]) {
    const range = symbol.selectionRange ?? symbol.range ?? symbol.location?.range;
    out.push({
      name: symbol.name,
      kind: symbol.kind,
      line: (range?.start?.line ?? 0) + 1,
    });
    if (Array.isArray(symbol.children)) flattenSymbols(symbol.children, out);
  }
  return out;
}

const DIAGNOSTIC_WAIT_MS = 4000;
const MAX_DIAGNOSTICS = 20;
// LSP önem dereceleri: 1 hata, 2 uyarı, 3 bilgi, 4 ipucu.
const SEVERITY_NAMES = ["error", "warning", "info", "hint"] as const;

// Düzenleme sonrası dosyanın tanılamaları. Sunucu yoksa/kurulu değilse null:
// bu bilgi "edit başarısız" anlamına gelmez, sadece ek bilgi yoktur.
export async function fileDiagnostics(filePath: string): Promise<FileDiagnostic[] | null> {
  const server = serverFor(filePath);
  if (!server) return null;

  const client = getClient(server);
  try {
    await client.start();
  } catch {
    return null;
  }

  try {
    const raw = await client.refreshDiagnostics(filePath, DIAGNOSTIC_WAIT_MS);
    if (!raw) return null;
    return raw.slice(0, MAX_DIAGNOSTICS).map((entry) => ({
      line: (entry.range?.start?.line ?? 0) + 1,
      character: (entry.range?.start?.character ?? 0) + 1,
      severity: SEVERITY_NAMES[(entry.severity ?? 2) - 1] ?? "warning",
      message: String(entry.message ?? "").trim().slice(0, 300),
      source: entry.source,
    }));
  } catch {
    return null;
  }
}

export async function codeIntel(args: Record<string, unknown> = {}): Promise<CodeIntelResult> {
  const operation = String(args.operation ?? "").trim();
  if (!OPERATIONS.has(operation)) {
    return {
      success: false,
      error: `Unknown operation: ${operation}. Use one of: definition, references, hover, symbols.`,
    };
  }

  const filePath = resolvePath(args.path);
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return { success: false, error: `File not found: ${args.path}` };
  }

  const server = serverFor(filePath);
  if (!server) {
    return {
      success: false,
      error: `No language server configured for '${
        path.extname(filePath) || "unknown"
      }' files.`,
    };
  }

  const line = Number(args.line);
  const character = Number(args.character);
  const needsPosition = operation !== "symbols";
  if (
    needsPosition &&
    (!Number.isInteger(line) || line < 1 || !Number.isInteger(character) || character < 1)
  ) {
    return { success: false, error: "This operation requires 'line' and 'character' (1-based)." };
  }

  const client = getClient(server);
  try {
    await client.start();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `Language server "${server.command}" is not available (${message}). Install it with: ${server.hint}`,
    };
  }

  try {
    if (operation === "symbols") {
      const result = await client.symbols(filePath);
      const symbols = flattenSymbols(result);
      return {
        success: true,
        operation,
        path: filePath,
        count: symbols.length,
        symbols: symbols.slice(0, 200),
      };
    }

    if (operation === "hover") {
      const result = (await client.hover(filePath, line - 1, character - 1)) as {
        contents?: unknown;
      } | null;
      const contents = result?.contents;
      const text =
        typeof contents === "string"
          ? contents
          : Array.isArray(contents)
            ? contents.map((part) => (part as { value?: string })?.value ?? "").join("\n")
            : ((contents as { value?: string } | null | undefined)?.value ?? "");
      return { success: true, operation, path: filePath, hover: text.trim() };
    }

    // Buraya yalnızca definition/references kalıyor; eskiden dinamik
    // `client[operation]` çağrısıyla yapılıyordu.
    const result =
      operation === "definition"
        ? await client.definition(filePath, line - 1, character - 1)
        : await client.references(filePath, line - 1, character - 1);
    const list = Array.isArray(result) ? result : result ? [result] : [];
    const locations = list.map(locationEntry);
    return {
      success: true,
      operation,
      path: filePath,
      count: locations.length,
      locations: locations.slice(0, 100),
    };
  } catch (error) {
    client.kill();
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: `Language server error: ${message}` };
  }
}
