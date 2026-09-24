import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { loadConfig } from "./config.js";
import type { McpServerConfig } from "./config.js";
import type { ToolSchema } from "./tools.js";

// MCP (Model Context Protocol) istemcisi: stdio ve HTTP taşımaları üzerinden
// sunuculara bağlanır, araçlarını listeler ve çağırır. Araçlar modele
// `mcp__<sunucu>__<araç>` adıyla verilir; ad çakışması olmaz.

export interface McpServer {
  name: string;
  config: McpServerConfig;
}

export interface McpTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

const REQUEST_TIMEOUT_MS = 30_000;
const TOOL_PREFIX = "mcp__";

interface Pending {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

function configServers(): McpServer[] {
  return Object.entries(loadConfig().mcp).map(([name, config]) => ({ name, config }));
}

export function mcpServers(): McpServer[] {
  return configServers();
}

export function toolName(server: string, tool: string): string {
  return `${TOOL_PREFIX}${server}__${tool}`;
}

export function parseToolName(name: string): { server: string; tool: string } | null {
  if (!name.startsWith(TOOL_PREFIX)) return null;
  const rest = name.slice(TOOL_PREFIX.length);
  const index = rest.indexOf("__");
  if (index <= 0) return null;
  return { server: rest.slice(0, index), tool: rest.slice(index + 2) };
}

class StdioTransport {
  child: ChildProcess;
  private buffer = Buffer.alloc(0);
  private pending = new Map<number, Pending>();
  private nextId = 1;
  lastError = "";
  onMessage: ((message: unknown) => void) | null = null;

  constructor(config: McpServerConfig) {
    // Windows'ta .cmd/.bat sunucuları (npx gibi) shell ile çalışır; shell
    // kullanılırken boşluklu yollar tırnaklanmalı yoksa cmd.exe yolu böler.
    const useShell = process.platform === "win32";
    const quote = (value: string): string =>
      useShell && /[ 	"]/.test(value) ? `"${value.replace(/"/g, '\\"')}"` : value;

    this.child = spawn(quote(String(config.command)), (config.args ?? []).map((arg) => quote(String(arg))), {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, ...(config.env ?? {}) },
      shell: useShell,
    });
    this.child.stdout?.on("data", (chunk: Buffer) => this.#onData(chunk));
    // Sunucunun hata çıktısı, bağlanamama durumunda mesaja eklenir.
    this.child.stderr?.on("data", (chunk: Buffer) => {
      this.lastError = String(chunk).trim().split("\n").slice(-3).join(" ");
    });
    this.child.on("error", (error: Error) => this.#failAll(error));
    this.child.on("exit", () =>
      this.#failAll(new Error(`MCP server exited${this.lastError ? `: ${this.lastError}` : ""}`)),
    );
  }

  #failAll(error: Error): void {
    for (const [, entry] of this.pending) {
      clearTimeout(entry.timer);
      entry.reject(error);
    }
    this.pending.clear();
  }

  #onData(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    for (;;) {
      const text = this.buffer.toString("utf8");
      const newline = text.indexOf("\n");
      if (newline === -1) return;
      const line = text.slice(0, newline).trim();
      this.buffer = this.buffer.subarray(Buffer.byteLength(text.slice(0, newline + 1), "utf8"));
      if (!line) continue;
      try {
        this.onMessage?.(JSON.parse(line));
      } catch {
        // bozuk satırı yoksay
      }
    }
  }

  send(payload: unknown): void {
    this.child.stdin?.write(`${JSON.stringify(payload)}\n`);
  }

  request(method: string, params?: unknown): Promise<unknown> {
    const id = this.nextId++;
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`MCP request timed out: ${method}`));
      }, REQUEST_TIMEOUT_MS);
      this.pending.set(id, { resolve, reject, timer });
      this.send({ jsonrpc: "2.0", id, method, params });
    });
  }

  handleResponse(message: { id?: unknown; result?: unknown; error?: { message?: string } }): void {
    if (message.id == null) return;
    const entry = this.pending.get(Number(message.id));
    if (!entry) return;
    this.pending.delete(Number(message.id));
    clearTimeout(entry.timer);
    if (message.error) entry.reject(new Error(message.error.message ?? "MCP error"));
    else entry.resolve(message.result);
  }

  close(): void {
    try {
      this.child.kill();
    } catch {
      // yoksay
    }
  }
}

export interface McpConnection {
  name: string;
  tools: McpTool[];
  call(tool: string, args: Record<string, unknown>): Promise<unknown>;
  close(): void;
}

async function connectStdio(server: McpServer): Promise<McpConnection> {
  const transport = new StdioTransport(server.config);
  transport.onMessage = (message) =>
    transport.handleResponse(message as { id?: unknown; result?: unknown });

  await transport.request("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: { tools: {} },
    clientInfo: { name: "wenox-cli", version: "1" },
  });
  transport.send({ jsonrpc: "2.0", method: "notifications/initialized", params: {} });

  const listed = (await transport.request("tools/list", {})) as { tools?: McpTool[] };
  return {
    name: server.name,
    tools: Array.isArray(listed?.tools) ? listed.tools : [],
    call: async (tool, args) => transport.request("tools/call", { name: tool, arguments: args }),
    close: () => transport.close(),
  };
}

async function connectHttp(server: McpServer): Promise<McpConnection> {
  const url = String(server.config.url);
  let id = 1;

  const request = async (method: string, params?: unknown): Promise<unknown> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: id++, method, params }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const text = await response.text();
      // SSE yanıtı da olabilir: son "data:" satırını al.
      const payload = text.startsWith("event:") || text.startsWith("data:")
        ? text.split("\n").filter((line) => line.startsWith("data:")).pop()?.slice(5).trim()
        : text;
      const body = JSON.parse(String(payload ?? "{}")) as {
        result?: unknown;
        error?: { message?: string };
      };
      if (body.error) throw new Error(body.error.message ?? "MCP error");
      return body.result;
    } finally {
      clearTimeout(timer);
    }
  };

  await request("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: { tools: {} },
    clientInfo: { name: "wenox-cli", version: "1" },
  });
  const listed = (await request("tools/list", {})) as { tools?: McpTool[] };
  return {
    name: server.name,
    tools: Array.isArray(listed?.tools) ? listed.tools : [],
    call: (tool, args) => request("tools/call", { name: tool, arguments: args }),
    close: () => {},
  };
}

export async function connect(server: McpServer): Promise<McpConnection> {
  if (server.config.url) return connectHttp(server);
  return connectStdio(server);
}

// Tüm sunuculara bağlanır; bağlanamayan sunucu sessizce atlanır (uygulama
// MCP yüzünden açılmamazlık etmemeli).
export async function connectAll(): Promise<{ connections: McpConnection[]; errors: string[] }> {
  const connections: McpConnection[] = [];
  const errors: string[] = [];
  for (const server of configServers()) {
    try {
      connections.push(await connect(server));
    } catch (error) {
      errors.push(`${server.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { connections, errors };
}

// MCP araçlarını modelin gördüğü şemaya çevirir.
export function toolSchemas(connections: McpConnection[]): ToolSchema[] {
  const schemas: ToolSchema[] = [];
  for (const connection of connections) {
    for (const tool of connection.tools) {
      schemas.push({
        type: "function",
        function: {
          name: toolName(connection.name, tool.name),
          description: `[MCP:${connection.name}] ${tool.description ?? tool.name}`,
          parameters: (tool.inputSchema as ToolSchema["function"]["parameters"]) ?? {
            type: "object",
            properties: {},
          },
        },
      });
    }
  }
  return schemas;
}

// tools/call yanıtı: { content: [{type:"text", text}] } → düz metin.
export function callResultText(result: unknown): string {
  const content = (result as { content?: unknown })?.content;
  if (!Array.isArray(content)) return typeof result === "string" ? result : JSON.stringify(result);
  return content
    .map((part) => {
      const entry = part as { type?: string; text?: string };
      return entry.type === "text" ? String(entry.text ?? "") : `[${entry.type ?? "content"}]`;
    })
    .join("\n")
    .trim();
}
