import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { resolvePath } from "./utils.js";

const REQUEST_TIMEOUT_MS = 20_000;

const SERVERS = [
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

export function serverFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return SERVERS.find((server) => server.exts.includes(ext)) ?? null;
}

function fileUri(filePath) {
  return pathToFileURL(filePath).href;
}

function uriToPath(uri) {
  try {
    return fileURLToPath(uri);
  } catch {
    return uri;
  }
}

class LspClient {
  constructor(server) {
    this.server = server;
    this.child = null;
    this.buffer = Buffer.alloc(0);
    this.nextId = 1;
    this.pending = new Map();
    this.started = false;
    this.opened = new Set();
    this.starting = null;
  }

  async start() {
    if (this.started) return;
    if (this.starting) return this.starting;
    this.starting = this.#boot();
    try {
      await this.starting;
    } finally {
      this.starting = null;
    }
  }

  async #boot() {
    const child = spawn(this.server.command, this.server.args, {
      stdio: ["pipe", "pipe", "pipe"],
      shell: process.platform === "win32",
    });
    this.child = child;
    child.on("error", (error) => this.#failAll(error));
    child.on("exit", () => this.#failAll(new Error("language server exited")));
    child.stdout.on("data", (chunk) => this.#onData(chunk));
    child.stderr.on("data", () => {});

    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("language server start timeout")), REQUEST_TIMEOUT_MS);
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
        },
      },
    });
    this.#notify("initialized", {});
    this.started = true;
    process.once("exit", () => this.kill());
  }

  kill() {
    try {
      this.#notify("exit", {});
      this.child?.kill();
    } catch {
      // yoksay
    }
    this.child = null;
    this.started = false;
  }

  #send(payload) {
    if (!this.child?.stdin?.writable) throw new Error("language server is not running");
    const body = JSON.stringify(payload);
    this.child.stdin.write(`Content-Length: ${Buffer.byteLength(body, "utf8")}\r\n\r\n${body}`);
  }

  #notify(method, params) {
    this.#send({ jsonrpc: "2.0", method, params });
  }

  #request(method, params) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
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
        reject(error);
      }
    });
  }

  #dispatch(message) {
    if (message.id != null && this.pending.has(message.id)) {
      const entry = this.pending.get(message.id);
      this.pending.delete(message.id);
      clearTimeout(entry.timer);
      if (message.error) entry.reject(new Error(message.error.message ?? "language server error"));
      else entry.resolve(message.result);
    }
  }

  #failAll(error) {
    for (const [, entry] of this.pending) {
      clearTimeout(entry.timer);
      entry.reject(error);
    }
    this.pending.clear();
    this.started = false;
  }

  #onData(chunk) {
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
        this.#dispatch(JSON.parse(body));
      } catch {
        // bozuk mesajı yoksay
      }
    }
  }

  async openDocument(filePath) {
    const uri = fileUri(filePath);
    if (this.opened.has(uri)) return uri;
    const text = fs.readFileSync(filePath, "utf8");
    this.#notify("textDocument/didOpen", {
      textDocument: { uri, languageId: this.server.languageId, version: 1, text },
    });
    this.opened.add(uri);
    return uri;
  }

  async definition(filePath, line, character) {
    const uri = await this.openDocument(filePath);
    return this.#request("textDocument/definition", {
      textDocument: { uri },
      position: { line, character },
    });
  }

  async references(filePath, line, character) {
    const uri = await this.openDocument(filePath);
    return this.#request("textDocument/references", {
      textDocument: { uri },
      position: { line, character },
      context: { includeDeclaration: true },
    });
  }

  async hover(filePath, line, character) {
    const uri = await this.openDocument(filePath);
    return this.#request("textDocument/hover", {
      textDocument: { uri },
      position: { line, character },
    });
  }

  async symbols(filePath) {
    const uri = await this.openDocument(filePath);
    return this.#request("textDocument/documentSymbol", { textDocument: { uri } });
  }
}

const clients = new Map();

function getClient(server) {
  const key = `${server.command}:${process.cwd()}`;
  if (!clients.has(key)) clients.set(key, new LspClient(server));
  return clients.get(key);
}

function locationEntry(location) {
  const target = location.targetUri ? location.targetUri : location.uri;
  const range = location.targetSelectionRange ?? location.targetRange ?? location.range;
  return {
    file: uriToPath(target),
    line: (range?.start?.line ?? 0) + 1,
    character: (range?.start?.character ?? 0) + 1,
  };
}

function flattenSymbols(symbols, out = []) {
  for (const symbol of symbols ?? []) {
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

export async function codeIntel(args = {}) {
  const operation = String(args.operation ?? "").trim();
  if (!OPERATIONS.has(operation)) {
    return { success: false, error: `Unknown operation: ${operation}. Use one of: definition, references, hover, symbols.` };
  }

  const filePath = resolvePath(args.path);
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return { success: false, error: `File not found: ${args.path}` };
  }

  const server = serverFor(filePath);
  if (!server) {
    return { success: false, error: `No language server configured for '${path.extname(filePath) || "unknown"}' files.` };
  }

  const line = Number(args.line);
  const character = Number(args.character);
  const needsPosition = operation !== "symbols";
  if (needsPosition && (!Number.isInteger(line) || line < 1 || !Number.isInteger(character) || character < 1)) {
    return { success: false, error: "This operation requires 'line' and 'character' (1-based)." };
  }

  const client = getClient(server);
  try {
    await client.start();
  } catch (error) {
    return {
      success: false,
      error: `Language server "${server.command}" is not available (${error.message}). Install it with: ${server.hint}`,
    };
  }

  try {
    if (operation === "symbols") {
      const result = await client.symbols(filePath);
      const symbols = flattenSymbols(result);
      return { success: true, operation, path: filePath, count: symbols.length, symbols: symbols.slice(0, 200) };
    }

    if (operation === "hover") {
      const result = await client.hover(filePath, line - 1, character - 1);
      const contents = result?.contents;
      const text = typeof contents === "string"
        ? contents
        : Array.isArray(contents)
          ? contents.map((part) => part.value ?? "").join("\n")
          : contents?.value ?? "";
      return { success: true, operation, path: filePath, hover: text.trim() };
    }

    const result = await client[operation](filePath, line - 1, character - 1);
    const list = Array.isArray(result) ? result : result ? [result] : [];
    const locations = list.map(locationEntry);
    return { success: true, operation, path: filePath, count: locations.length, locations: locations.slice(0, 100) };
  } catch (error) {
    client.kill();
    return { success: false, error: `Language server error: ${error.message}` };
  }
}
