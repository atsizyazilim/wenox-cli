import chalk from "chalk";
import wrapAnsi from "wrap-ansi";
import stringWidth from "string-width";
import { renderMarkdownBlocks } from "../markdown.js";
import { theme } from "./theme.js";
import { t } from "../i18n/index.js";
import type { ItemId, TranscriptItem } from "../session.js";
import type { ToolArgs, ToolResult } from "../tools.js";

const TOOL_ICONS: Record<string, string> = {
  read_file: "📖",
  write_file: "💾",
  edit_file: "✏️",
  list_dir: "📁",
  search_code: "🔍",
  run_command: "⚡",
  code_intel: "🧭",
};

// Komut bloğu: `$ komut` başlığı ve çıktısı, solda renkli şerit ile.
// (Tam genişlik arka plan kullanmıyoruz: kırpma/taşmada hizası bozuluyordu.)
function commandBar(text: string, colorName: "green" | "red" | "cyan"): string {
  return `${chalk[colorName]("│")} ${text}`;
}

const MAX_COMMAND_LINES = 6;

// Düşünme süresi: saniyenin altında milisaniye, üstünde saniye olarak yazılır.
function thoughtTime(ms: number): string {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

function commandOutput(
  result: ToolResult,
  width: number,
  expanded: boolean,
): string[] {
  const inner = Math.max(10, width - 4);
  const out = String(result.stdout ?? "").replace(/\n+$/, "");
  const err = String(result.stderr ?? "").replace(/\n+$/, "");
  const code = result.returncode ?? 0;
  const color = code === 0 ? theme.ok : theme.err;

  const body: string[] = [];
  if (out) body.push(...wrapLines(out, inner));
  if (err) body.push(...wrapLines(err, inner).map((line) => chalk.red(line)));
  if (body.length === 0) body.push(chalk.dim(t("tool.noOutput")));
  if (code !== 0) body.push(chalk[color](t("tool.exitCode", { code })));

  // Uzun çıktıyı varsayılan olarak kısalt; karta tıklayınca tamamı görülebilir
  const hidden = Math.max(0, body.length - MAX_COMMAND_LINES);
  const visible = hidden > 0 && !expanded ? body.slice(0, MAX_COMMAND_LINES) : body;

  const rows = visible.map((line) => commandBar(line, color));
  if (hidden > 0) {
    const hint = expanded ? t("tool.collapseHint") : t("tool.expandHint", { count: hidden });
    rows.push(commandBar(chalk.dim(hint), color));
  }
  rows.push(commandBar("", color));
  return rows;
}

function wrapLines(text: string, width: number): string[] {
  return String(text)
    .split("\n")
    .flatMap((line) => {
      if (line === "") return [""];
      return wrapAnsi(line, Math.max(8, width), {
        hard: true,
        trim: false,
        wordWrap: true,
      }).split("\n");
    });
}

function detailOf(name: string, args: ToolArgs | null | undefined): string | undefined {
  if (!args) return "";
  switch (name) {
    case "read_file":
      return args.start_line
        ? `${args.path} (${args.start_line}-${args.end_line ?? t("tool.rangeEnd")})`
        : args.path;
    case "search_code":
      return `'${args.query ?? ""}'`;
    case "list_dir":
      return args.path ?? ".";
    case "run_command":
      return args.command;
    case "code_intel":
      return `${args.operation ?? ""}  ${args.path ?? ""}`;
    default:
      return args.path ?? "";
  }
}

function summaryOf(name: string, result: ToolResult): string {
  switch (name) {
    case "read_file":
      return t("tool.read", { count: result.total_lines ?? 0 });
    case "write_file":
      return t("tool.written");
    case "edit_file":
      return t("tool.updated");
    case "list_dir":
      return t("tool.items", { count: result.total_items ?? 0 });
    case "search_code":
      return t("tool.matches", { count: result.match_count ?? 0 });
    case "run_command":
      return t("tool.exitCode", { code: result.returncode ?? 0 });
    case "code_intel":
      return typeof result.count === "number"
        ? t("tool.results", { count: result.count })
        : t("tool.done");
    default:
      return t("tool.done");
  }
}

function itemLines(
  item: TranscriptItem,
  width: number,
  options: { isLast?: boolean } = {},
): string[] {
  switch (item.role) {
    case "user": {
      const inner = wrapLines(item.text ?? "", Math.max(10, width - 4));
      const bar = chalk.hex(theme.userAccent)("│");
      const bg = chalk.bgHex(theme.userBlockBg);
      const blank = bg(" ".repeat(width));
      const body = inner.map((line) => {
        const used = 2 + stringWidth(line);
        return bg(`${bar} ${line}${" ".repeat(Math.max(0, width - used))}`);
      });
      if (item.queued) {
        const label = t("view.queued");
        const used = 2 + label.length;
        body.push(
          bg(
            `${bar} ${chalk.bgHex("#2f6fed").white.bold(label)}${" ".repeat(
              Math.max(0, width - used),
            )}`,
          ),
        );
      }
      return [blank, ...body, blank, ""];
    }

    case "assistant": {
      const lines: string[] = [];
      const meta = item.meta ?? {};
      // Düşünme metni varsa süresi kendi kartında gösteriliyor.
      if (meta.thinkingMs && !meta.reasoning) {
        lines.push(chalk.dim(t("view.thinking", { ms: meta.thinkingMs })), "");
      }
      for (const block of renderMarkdownBlocks(item.text)) {
        lines.push(...wrapLines(block, width), "");
      }
      if (item.live) return lines;
      const seconds = meta.durationMs ? ` · ${(meta.durationMs / 1000).toFixed(1)}s` : "";
      lines.push(
        chalk.dim(t("view.build", { model: meta.modelName ?? "WenOX", seconds })),
        "",
      );
      return lines;
    }

    case "thinking": {
      // opencode tarzı: tek satır başlık, gövde yalnızca kullanıcı açınca.
      // Sürerken "Düşünüyor", bitince "Düşündü: 959ms".
      const ms = item.meta?.thinkingDurationMs;
      const label =
        ms == null ? t("view.thinkingLive") : t("view.thought", { time: thoughtTime(ms) });
      const title = chalk.hex(theme.menuSelectedBg)(`  ${item.expanded ? "−" : "+"} ${label}`);

      const lines = [title];
      if (item.expanded) {
        const body = wrapLines(item.text ?? "", Math.max(10, width - 6));
        lines.push(...body.map((line) => chalk.hex(theme.menuDesc)(`     ${line}`)));
      }
      lines.push("");
      return lines;
    }

    case "tool-call":
      if (item.name === "ask_user") {
        return [chalk.hex(theme.menuDesc)(t("view.questionAsked")), ""];
      }
      if (item.name === "run_command") {
        const inner = Math.max(10, width - 4);
        const header = wrapLines(`$ ${item.args?.command ?? ""}`, inner);
        const rows = [
          commandBar("", theme.accent),
          ...header.map((line) => commandBar(chalk.bold(line), theme.accent)),
          commandBar("", theme.accent),
        ];
        // Hâlâ çalışıyorsa (son öğe bu çağrı) durum satırı + nefes payı
        if (options.isLast) {
          rows.push(commandBar(chalk.dim(t("tool.running")), theme.accent), "");
        }
        return rows;
      }
      return [
        `${chalk.cyan(`${TOOL_ICONS[item.name ?? ""] ?? "⚙️"} ${item.name}`)}  ${chalk.dim(
          detailOf(item.name ?? "", item.args),
        )}`,
      ];

    case "tool-result": {
      const result = item.result ?? { success: false };
      if (item.name === "ask_user") {
        const answer = result.answer ?? "";
        return [chalk.hex(theme.menuDesc)(t("view.answer", { answer })), ""];
      }
      if (!result.success) {
        return [chalk.red(`  ↳ ${result.error ?? t("tool.error")}`), ""];
      }
      if (item.name === "run_command") {
        return [...commandOutput(result, width, Boolean(item.expanded)), ""];
      }
      const resultLines = [
        chalk.hex(theme.menuDesc)(`  ↳ ${summaryOf(item.name ?? "", result)}`),
      ];
      if (result.diff) {
        for (const line of String(result.diff).replace(/\n$/, "").split("\n").slice(0, 60)) {
          let color = chalk.dim;
          if (line.startsWith("+")) color = chalk.green;
          else if (line.startsWith("-")) color = chalk.red;
          else if (line.startsWith("@@")) color = chalk.cyan;
          resultLines.push(`  ${color(line)}`);
        }
      }
      resultLines.push("");
      return resultLines;
    }

    case "info":
      return [...wrapLines(item.text ?? "", width).map((line) => chalk.hex(theme.menuDesc)(line)), ""];

    case "error":
      return [...wrapLines(item.text ?? "", width).map((line) => chalk.red(line)), ""];

    default:
      return [];
  }
}

// `owners`: her satırın hangi öğeye ait olduğu (tıklayınca aç/kapa için)
export function buildTranscript(
  items: TranscriptItem[],
  width: number,
  options: { isLast?: boolean } = {},
): { lines: string[]; owners: ItemId[] } {
  const lines: string[] = [];
  const owners: ItemId[] = [];
  items.forEach((item, index) => {
    const block = itemLines(item, width, {
      ...options,
      isLast: index === items.length - 1,
    });
    for (const line of block) {
      lines.push(line);
      owners.push(item.id);
    }
  });
  return { lines, owners };
}

export function formatTokens(value: unknown): string {
  const n = Number(value) || 0;
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}K`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}
