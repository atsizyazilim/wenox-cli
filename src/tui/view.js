import chalk from "chalk";
import wrapAnsi from "wrap-ansi";
import stringWidth from "string-width";
import { renderMarkdownBlocks } from "../markdown.js";
import { theme } from "./theme.js";
import { t } from "../i18n/index.js";

const TOOL_ICONS = {
  read_file: "📖",
  write_file: "💾",
  edit_file: "✏️",
  list_dir: "📁",
  search_code: "🔍",
  run_command: "⚡",
};

function wrapLines(text, width) {
  return String(text)
    .split("\n")
    .flatMap((line) => {
      if (line === "") return [""];
      return wrapAnsi(line, Math.max(8, width), { hard: true, trim: false, wordWrap: true }).split("\n");
    });
}

function detailOf(name, args) {
  if (!args) return "";
  switch (name) {
    case "read_file":
      return args.start_line ? `${args.path} (${args.start_line}-${args.end_line ?? t("tool.rangeEnd")})` : args.path;
    case "search_code":
      return `'${args.query ?? ""}'`;
    case "list_dir":
      return args.path ?? ".";
    case "run_command":
      return args.command;
    default:
      return args.path ?? "";
  }
}

function summaryOf(name, result) {
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
    default:
      return t("tool.done");
  }
}

function itemLines(item, width) {
  switch (item.role) {
    case "user": {
      const inner = wrapLines(item.text, Math.max(10, width - 4));
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
          bg(`${bar} ${chalk.bgHex("#2f6fed").white.bold(label)}${" ".repeat(Math.max(0, width - used))}`),
        );
      }
      return [blank, ...body, blank, ""];
    }

    case "assistant": {
      const lines = [];
      const meta = item.meta ?? {};
      if (meta.thinkingMs) {
        lines.push(chalk.dim(t("view.thinking", { ms: meta.thinkingMs })), "");
      }
      for (const block of renderMarkdownBlocks(item.text)) {
        lines.push(...wrapLines(block, width), "");
      }
      if (item.live) return lines;
      const seconds = meta.durationMs ? ` · ${(meta.durationMs / 1000).toFixed(1)}s` : "";
      lines.push(chalk.dim(t("view.build", { model: meta.modelName ?? "WenOX", seconds })), "");
      return lines;
    }

    case "tool-call":
      if (item.name === "ask_user") {
        return [chalk.hex(theme.menuDesc)(t("view.questionAsked")), ""];
      }
      return [
        `${chalk.cyan(`${TOOL_ICONS[item.name] ?? "⚙️"} ${item.name}`)}  ${chalk.dim(detailOf(item.name, item.args))}`,
      ];

    case "tool-result": {
      const result = item.result ?? {};
      if (item.name === "ask_user") {
        const answer = result.answer ?? "";
        return [chalk.hex(theme.menuDesc)(t("view.answer", { answer })), ""];
      }
      if (!result.success) {
        return [chalk.red(`  ↳ ${result.error ?? t("tool.error")}`), ""];
      }
      const lines = [chalk.hex(theme.menuDesc)(`  ↳ ${summaryOf(item.name, result)}`)];
      if (result.diff) {
        for (const line of String(result.diff).replace(/\n$/, "").split("\n").slice(0, 60)) {
          let color = chalk.dim;
          if (line.startsWith("+")) color = chalk.green;
          else if (line.startsWith("-")) color = chalk.red;
          else if (line.startsWith("@@")) color = chalk.cyan;
          lines.push(`  ${color(line)}`);
        }
      }
      lines.push("");
      return lines;
    }

    case "info":
      return [...wrapLines(item.text, width).map((line) => chalk.hex(theme.menuDesc)(line)), ""];

    case "error":
      return [...wrapLines(item.text, width).map((line) => chalk.red(line)), ""];

    default:
      return [];
  }
}

export function buildTranscript(items, width) {
  const lines = [];
  for (const item of items) {
    lines.push(...itemLines(item, width));
  }
  return lines;
}

export function formatTokens(value) {
  const n = Number(value) || 0;
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}K`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}
