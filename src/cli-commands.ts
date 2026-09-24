import fs from "node:fs";
import path from "node:path";
import chalk from "chalk";
import { configDir } from "./config.js";
import { errorProp } from "./utils.js";
import { API_BASE_URL, loadConfig, saveConfig } from "./config.js";
import type { Config } from "./config.js";
import { connect, mcpServers } from "./mcp.js";
import { sessionHeaders } from "./session.js";
import { deleteSession, listSessions } from "./session.js";
import { t } from "./i18n/index.js";

// `wenox models|sessions|stats` alt komutları. Hepsi sunucuya/otağa bakar ve
// terminalde okunur bir özet basar; TUI'yi hiç açmazlar.

interface RemoteModel {
  id?: string;
  name?: string;
  context_window?: number;
  vision?: boolean;
}

async function fetchModels(apiKey: string): Promise<RemoteModel[] | null> {
  try {
    const response = await fetch(`${API_BASE_URL.replace(/\/+$/, "")}/models`, {
      headers: sessionHeaders({ Authorization: `Bearer ${apiKey}` }),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { data?: RemoteModel[] };
    return Array.isArray(body.data) ? body.data : [];
  } catch {
    return null;
  }
}

async function cmdModels(apiKey: string, opts: { json: boolean; currentModel: string }): Promise<void> {
  const models = await fetchModels(apiKey);
  if (models === null) {
    console.error(chalk.red(t("cli.modelsUnavailable")));
    process.exitCode = 1;
    return;
  }
  if (opts.json) {
    console.log(JSON.stringify(models, null, 2));
    return;
  }
  if (models.length === 0) {
    console.log(chalk.dim(t("cli.modelsEmpty")));
    return;
  }

  const rows = models.map((model) => {
    const id = String(model.id ?? "");
    const name = model.name && model.name !== id ? model.name : "";
    const context = model.context_window
      ? t("models.contextWindow", { k: Math.round(model.context_window / 1000) })
      : "—";
    const vision = model.vision === true ? "✓" : model.vision === false ? "—" : "?";
    return {
      id,
      name,
      context,
      vision,
      active: id === opts.currentModel,
    };
  });

  const idWidth = Math.max(12, ...rows.map((row) => row.id.length));
  const nameWidth = Math.max(0, ...rows.map((row) => row.name.length));
  console.log(chalk.bold(t("cli.modelsTitle")));
  for (const row of rows) {
    const mark = row.active ? chalk.green("● ") : "  ";
    const name = nameWidth > 0 ? chalk.dim(row.name.padEnd(nameWidth) + "  ") : "";
    console.log(
      `${mark}${chalk.cyan(row.id.padEnd(idWidth))}  ${name}${chalk.dim(row.context)}  ${chalk.dim(
        row.vision,
      )}`,
    );
  }
  console.log(chalk.dim(t("cli.modelsLegend")));
}

function cmdSessions(rest: string[], opts: { json: boolean }): void {
  const [action, id] = rest;

  if (action === "delete" || action === "remove" || action === "rm") {
    if (!id) {
      console.error(chalk.red(t("cli.sessionIdRequired")));
      process.exitCode = 1;
      return;
    }
    const removed = deleteSession(id);
    console.log(removed ? chalk.green(t("cli.sessionDeleted", { id })) : chalk.red(t("session.notFound", { id })));
    process.exitCode = removed ? 0 : 1;
    return;
  }

  const sessions = listSessions();
  if (opts.json) {
    console.log(
      JSON.stringify(
        sessions.map((session) => ({
          id: session.id,
          title: session.title,
          model: session.model,
          tokens: session.usedTokens ?? session.tokens ?? 0,
          updatedAt: session.updatedAt,
          messages: (session.messages ?? []).length,
        })),
        null,
        2,
      ),
    );
    return;
  }
  if (sessions.length === 0) {
    console.log(chalk.dim(t("session.none")));
    return;
  }

  console.log(chalk.bold(t("session.past")));
  for (const session of sessions) {
    const title = session.title?.trim() || t("session.untitled");
    const when = new Date(session.updatedAt ?? 0).toLocaleString();
    console.log(
      `  ${chalk.cyan(session.id)}  ${title}  ${chalk.dim(
        `${when}  ·  ${(session.messages ?? []).length} msg  ·  ${session.model}`,
      )}`,
    );
  }
  console.log(chalk.dim(t("session.pastHint")));
}

export interface UsageSummary {
  sessions: number;
  tokens: number;
  models: { model: string; sessions: number; tokens: number }[];
}

export function summarizeSessions(sessions: SessionLike[]): UsageSummary {
  const byModel = new Map<string, { sessions: number; tokens: number }>();
  let tokens = 0;

  for (const session of sessions) {
    const used = Number(session.usedTokens ?? session.tokens) || 0;
    tokens += used;
    const key = session.model || "?";
    const entry = byModel.get(key) ?? { sessions: 0, tokens: 0 };
    entry.sessions += 1;
    entry.tokens += used;
    byModel.set(key, entry);
  }

  return {
    sessions: sessions.length,
    tokens,
    models: [...byModel.entries()]
      .map(([model, data]) => ({ model, ...data }))
      .sort((a, b) => b.tokens - a.tokens),
  };
}

interface SessionLike {
  model?: string;
  tokens?: number;
  usedTokens?: number;
}

function cmdStats(opts: { json: boolean }): void {
  const sessions = listSessions();
  const summary = summarizeSessions(sessions);

  if (opts.json) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  console.log(chalk.bold(t("cli.statsTitle")));
  console.log(
    `  ${t("cli.statsSessions")}: ${chalk.cyan(String(summary.sessions))}   ${t(
      "cli.statsTokens",
    )}: ${chalk.cyan(summary.tokens.toLocaleString())}`,
  );
  for (const data of summary.models) {
    console.log(
      `  ${chalk.dim(data.model.padEnd(24))} ${String(data.sessions).padStart(4)} ${t(
        "cli.statsSessionShort",
      )}  ${data.tokens.toLocaleString()} ${t("cli.statsTokensShort")}`,
    );
  }
}

// `wenox mcp [list|add|remove]`: MCP sunucularını yönetir.
export function saveMcp(name: string, value: Config["mcp"][string] | null): void {
  const cfg = loadConfig();
  const next = { ...cfg.mcp };
  if (value) next[name] = value;
  else delete next[name];
  // saveConfig yalnızca bilinen alanları yazıyor; mcp'yi doğrudan yazıyoruz.
  saveConfig({});
  const file = path.join(configDir(), "config.json");
  let data: Record<string, unknown> = {};
  try {
    data = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
  } catch {
    data = {};
  }
  data.mcp = next;
  fs.mkdirSync(configDir(), { recursive: true, mode: 0o700 });
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}
`, { encoding: "utf8", mode: 0o600 });
}

async function cmdMcp(rest: string[], opts: { json: boolean }): Promise<void> {
  const [action, name, command, ...args] = rest;

  if (action === "add") {
    if (!name || !command) {
      console.error(chalk.red(t("cli.mcpUsage")));
      process.exitCode = 1;
      return;
    }
    saveMcp(name, { command, args });
    console.log(chalk.green(t("cli.mcpAdded", { name })));
    return;
  }

  if (action === "remove" || action === "rm" || action === "delete") {
    if (!name) {
      console.error(chalk.red(t("cli.mcpUsage")));
      process.exitCode = 1;
      return;
    }
    saveMcp(name, null);
    console.log(chalk.green(t("cli.mcpRemoved", { name })));
    return;
  }

  const servers = mcpServers();
  if (servers.length === 0) {
    console.log(chalk.dim(t("cli.mcpNone")));
    console.log(chalk.dim(t("cli.mcpUsage")));
    return;
  }

  const lines: { name: string; target: string; tools: string[] | null }[] = [];
  for (const server of servers) {
    const target = server.config.url ?? `${server.config.command ?? ""} ${(server.config.args ?? []).join(" ")}`.trim();
    try {
      const connection = await connect(server);
      lines.push({ name: server.name, target, tools: connection.tools.map((tool) => tool.name) });
      connection.close();
    } catch (error) {
      lines.push({ name: server.name, target, tools: null });
      if (!opts.json) {
        console.log(
          `  ${chalk.red(server.name)}  ${chalk.dim(String(errorProp(error, "message")))}`,
        );
      }
    }
  }

  if (opts.json) {
    console.log(JSON.stringify(lines, null, 2));
    return;
  }
  console.log(chalk.bold(t("cli.mcpTitle")));
  for (const line of lines) {
    if (line.tools === null) continue;
    console.log(`  ${chalk.cyan(line.name)}  ${chalk.dim(line.target)}`);
    for (const tool of line.tools) console.log(`      ${chalk.dim("·")} ${tool}`);
  }
}

// Bilinen bir alt komut çalıştırıldıysa true döner (main erken çıkar).
export async function runSubcommand(
  command: string,
  rest: string[],
  options: { apiKey: string; currentModel: string; json: boolean },
): Promise<boolean> {
  switch (command) {
    case "models":
      await cmdModels(options.apiKey, { json: options.json, currentModel: options.currentModel });
      return true;
    case "sessions":
    case "session":
      cmdSessions(rest, { json: options.json });
      return true;
    case "stats":
      cmdStats({ json: options.json });
      return true;
    case "mcp":
      await cmdMcp(rest, { json: options.json });
      return true;
    default:
      return false;
  }
}
