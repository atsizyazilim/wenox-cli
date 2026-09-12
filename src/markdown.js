import chalk from "chalk";
import { marked } from "marked";
import cliHighlight from "cli-highlight";
import Table from "cli-table3";
import { t } from "./i18n/index.js";

const highlight =
  cliHighlight?.highlight ??
  cliHighlight?.default?.highlight ??
  ((code) => code);

export function renderInline(tokens = []) {
  if (!Array.isArray(tokens)) return "";
  return tokens.map(renderInlineToken).join("");
}

function renderInlineToken(token) {
  if (!token) return "";
  switch (token.type) {
    case "text":
      return token.tokens ? renderInline(token.tokens) : token.text ?? "";
    case "escape":
      return token.text ?? "";
    case "strong":
    case "em":
    case "del": {
      const inner = token.tokens
        ? renderInline(token.tokens)
        : token.text ?? "";
      if (token.type === "strong") return chalk.bold(inner);
      if (token.type === "em") return chalk.italic(inner);
      return chalk.strikethrough(inner);
    }
    case "codespan":
      return chalk.cyan(token.text ?? "");
    case "br":
      return "\n";
    case "link": {
      const label = renderInline(token.tokens) || token.text || token.href;
      if (!token.href || token.href === label) return chalk.blue.underline(label);
      return `${chalk.blue.underline(label)} ${chalk.dim(`(${token.href})`)}`;
    }
    case "image":
      return chalk.dim(t("markdown.image", { alt: token.text || token.href || "" }));
    case "html":
      return token.raw ?? token.text ?? "";
    default:
      return token.tokens ? renderInline(token.tokens) : token.raw ?? token.text ?? "";
  }
}

export function highlightCode(code, language) {
  try {
    return highlight(code, {
      language: language || undefined,
      theme: "monokai",
      ignoreIllegals: true,
    });
  } catch {
    return code;
  }
}

function renderCode(token) {
  const code = token.text ?? "";
  const body = highlightCode(code, token.lang);
  const lines = body.replace(/\n$/, "").split("\n");
  return lines.map((line) => `${chalk.dim("│ ")}${line}`).join("\n");
}

function renderTable(token) {
  const table = new Table({
    style: { head: [], border: [] },
    wordWrap: true,
  });
  if (Array.isArray(token.header)) {
    table.push(token.header.map((cell) => chalk.bold(renderInline(cell.tokens) || cell.text)));
  }
  for (const row of token.rows ?? []) {
    table.push(row.map((cell) => renderInline(cell.tokens) || cell.text));
  }
  return table.toString();
}

function renderList(token, depth) {
  const indent = "  ".repeat(depth);
  const lines = [];
  const items = token.items ?? [];
  const start = Number.isInteger(token.start) ? token.start : 1;

  items.forEach((item, index) => {
    const marker = token.ordered ? `${start + index}.` : "•";
    const body = renderBlocks(item.tokens ?? [], depth + 1).join("\n");
    const bodyLines = body.split("\n");
    const first = bodyLines.shift() ?? "";
    lines.push(`${indent}${chalk.cyan(marker)} ${first}`);
    for (const line of bodyLines) {
      lines.push(`${indent}${" ".repeat(marker.length + 1)}${line}`);
    }
    if (token.loose && index < items.length - 1) lines.push("");
  });

  return lines.join("\n");
}

function renderBlocks(tokens, depth = 0) {
  const out = [];
  for (const token of tokens ?? []) {
    if (!token) continue;
    switch (token.type) {
      case "space":
        break;
      case "heading": {
        const text = renderInline(token.tokens) || token.text || "";
        const styles = {
          1: chalk.bold.cyanBright,
          2: chalk.bold.cyan,
          3: chalk.bold,
        };
        const style = styles[token.depth] ?? chalk.bold;
        out.push("");
        out.push(style(text));
        break;
      }
      case "paragraph": {
        out.push(renderInline(token.tokens) || token.text || "");
        break;
      }
      case "text": {
        out.push(
          token.tokens ? renderInline(token.tokens) : token.text ?? "",
        );
        break;
      }
      case "code":
        out.push("");
        out.push(renderCode(token));
        out.push("");
        break;
      case "blockquote": {
        const body = renderBlocks(token.tokens ?? [], depth).join("\n");
        out.push(
          body
            .split("\n")
            .map((line) => `${chalk.dim("│ ")}${chalk.italic(line)}`)
            .join("\n"),
        );
        break;
      }
      case "list":
        out.push(renderList(token, depth));
        break;
      case "table":
        out.push(renderTable(token));
        break;
      case "hr":
        out.push(chalk.dim("─".repeat(40)));
        break;
      case "html":
        out.push(token.raw ?? "");
        break;
      default:
        out.push(token.raw ?? token.text ?? "");
    }
  }
  return out;
}

export function renderMarkdown(text) {
  if (!text) return "";
  try {
    const tokens = marked.lexer(text);
    return renderBlocks(tokens).join("\n\n").replace(/\n{3,}/g, "\n\n").trimEnd();
  } catch {
    return String(text);
  }
}

export function renderMarkdownBlocks(text) {
  if (!text) return [];
  try {
    return renderBlocks(marked.lexer(text)).filter((block) => block.trim() !== "");
  } catch {
    return [String(text)];
  }
}

export function renderMarkdownPlain(text) {
  return String(text ?? "");
}

export { Table };
