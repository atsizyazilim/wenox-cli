import chalk from "chalk";
import boxen from "boxen";
import ora from "ora";
import Table from "cli-table3";
import { LiveWriter } from "./live.js";
import { renderMarkdown, highlightCode } from "./markdown.js";
import { AVAILABLE_MODELS, API_BASE_URL } from "./config.js";
import { formatBytes } from "./utils.js";
import { t, localeTag } from "./i18n/index.js";

const LOGO = [
  " ██╗    ██╗███████╗███╗   ██╗ ██████╗ ██╗  ██╗",
  " ██║    ██║██╔════╝████╗  ██║██╔═══██╗╚██╗██╔╝",
  " ██║ █╗ ██║█████╗  ██╔██╗ ██║██║   ██║ ╚███╔╝ ",
  " ██║███╗██║██╔══╝  ██║╚██╗██║██║   ██║ ██╔██╗ ",
  " ╚███╔███╔╝███████╗██║ ╚████║╚██████╔╝██╔╝ ██╗",
  "  ╚══╝╚══╝ ╚══════╝╚═╝  ╚═══╝ ╚═════╝ ╚═╝  ╚═╝",
].join("\n");

const GREEN = "green";
const CYAN = "cyan";
const RED = "red";
const YELLOW = "yellow";

function termColumns() {
  return process.stdout.columns || 80;
}

function panelWidth() {
  return Math.max(30, Math.min(termColumns() - 2, 110));
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function createSpinner(text) {
  return ora({ text, color: CYAN, spinner: "dots" });
}

export function printError(message) {
  console.log(boxen(chalk.red(message), {
    padding: { top: 0, bottom: 0, left: 1, right: 1 },
    borderStyle: "round",
    borderColor: RED,
  }));
}

export function printSuccess(message) {
  console.log(`${chalk.bold.green("✓")} ${message}`);
}

export function printDim(message) {
  console.log(chalk.dim(message));
}

export function printWarning(message) {
  console.log(chalk.yellow(message));
}

export function welcomeMessage(account) {
  const name = typeof account?.name === "string" ? account.name.trim() : "";
  const lines = [name ? t("onboarding.welcomeNamed", { name }) : t("onboarding.welcomeAnon")];
  if (account?.premium) {
    const days = account.premium_days_remaining;
    lines.push(typeof days === "number" ? t("onboarding.premiumDays", { days }) : t("onboarding.premium"));
  } else {
    lines.push(t("onboarding.noPremium"));
  }
  if (typeof account?.credits_remaining === "number") {
    lines.push(t("onboarding.credits", { credits: account.credits_remaining.toLocaleString(localeTag()) }));
  }
  return lines.join("\n");
}

function renderBar(pct, width, label) {
  const filled = Math.max(0, Math.min(width, Math.round((pct / 100) * width)));
  const bar = chalk.cyan("█".repeat(filled)) + chalk.dim("░".repeat(width - filled));
  return `${bar} ${chalk.bold(String(pct).padStart(3))}%  ${chalk.dim(label)}`;
}

export async function showBootScreen(modelName = "", apiUrl = API_BASE_URL) {
  if (!process.stdout.isTTY) return;

  const width = panelWidth();
  const barWidth = Math.max(20, width - 26);
  const steps = t("boot.steps");

  process.stdout.write(`${boxen(chalk.bold.cyan(LOGO), {
    padding: { top: 0, bottom: 0, left: 1, right: 1 },
    borderStyle: "round",
    borderColor: CYAN,
    title: chalk.bold.white("W E N O X"),
    subtitle: chalk.dim(modelName ? `v2.0 • ${modelName}` : "WenOX AI CLI"),
    titleAlignment: "center",
    width,
  })}\n`);

  const live = new LiveWriter();
  const total = steps.length;
  const substeps = 4;

  for (let i = 0; i < total; i += 1) {
    for (let f = 1; f <= substeps; f += 1) {
      const pct = Math.round(((i + f / substeps) / total) * 100);
      live.update(`${renderBar(pct, barWidth, steps[i])}\n${chalk.dim(`   ${apiUrl}`)}`);
      await sleep(38);
    }
    live.update(`${renderBar(Math.round(((i + 1) / total) * 100), barWidth, steps[i])}\n${chalk.dim(`   ${apiUrl}`)}`);
  }

  live.finish(`${chalk.bold.green(t("boot.ready"))}\n${chalk.dim(t("boot.opening"))}`);
  await sleep(500);

  process.stdout.write("\x1b[2J\x1b[H");
}

function commandLine(cmd, desc) {
  return `${chalk.bold.white(cmd.padEnd(14))} ${chalk.dim(`- ${desc}`)}`;
}

export function printBanner({ modelName, apiUrl = API_BASE_URL }) {
  const now = new Date().toLocaleTimeString(localeTag());
  const content = [
    `${chalk.bold.cyan("WenOX AI CLI")}${chalk.dim(t("banner.tagline"))}`,
    chalk.dim("─".repeat(42)),
    `${chalk.bold(t("banner.apiEndpoint"))} ${chalk.dim(apiUrl)}`,
    `${chalk.bold(t("banner.activeModel"))} ${chalk.bold.green(modelName)}`,
    `${chalk.bold(t("banner.activeDir"))} ${chalk.yellow(process.cwd())}`,
    `${chalk.bold(t("banner.sessionLabel"))} ${chalk.dim(`${now}  •  ${t("banner.ready")}`)}`,
    chalk.dim("─".repeat(42)),
    chalk.bold.yellow(t("banner.commandsTitle")),
    ...t("banner.commandRows").map(([cmd, desc]) => commandLine(cmd, desc)),
    "",
    chalk.bold.cyan(t("banner.hint")),
  ].join("\n");

  console.log(boxen(content, {
    padding: { top: 1, bottom: 1, left: 2, right: 2 },
    borderStyle: "round",
    borderColor: CYAN,
    title: chalk.bold.white(t("banner.windowTitle")),
    subtitle: chalk.green(t("banner.windowSubtitle")),
    titleAlignment: "center",
  }));
}

export function printHelp() {
  const table = new Table({
    head: [chalk.bold.yellow(t("help.tableCommand")), chalk.bold.white(t("help.tableDescription"))],
    style: { head: [], border: [CYAN] },
    colWidths: [22, 62],
    wordWrap: true,
  });
  table.push(...t("help.commandRows"));
  console.log(table.toString());
}

export function printModelsTable(currentId) {
  const headColors = [
    chalk.bold.cyan,
    chalk.bold.white,
    chalk.bold.magenta,
    chalk.bold.white,
    chalk.bold.yellow,
  ];
  const table = new Table({
    head: t("models.head").map((label, i) => headColors[i](label)),
    style: { head: [], border: [GREEN] },
    colWidths: [4, 16, 20, 46, 10],
    wordWrap: true,
  });

  for (const [key, info] of Object.entries(AVAILABLE_MODELS)) {
    const active = info.id === currentId;
    table.push([
      key,
      info.name,
      info.id,
      t(`modelDescriptions.${info.id}`),
      active ? chalk.bold.green(t("models.active")) : "",
    ]);
  }
  console.log(table.toString());
}

export function printToolCall(toolName, args = {}) {
  switch (toolName) {
    case "read_file": {
      const range = args.start_line ? ` (${args.start_line}-${args.end_line ?? t("tool.rangeEnd")})` : "";
      console.log(`${chalk.bold.cyan("📖 [read_file]")} ${chalk.underline(args.path ?? "")}${chalk.dim(range)}`);
      break;
    }
    case "write_file": {
      const count = String(args.content ?? "").split("\n").length;
      console.log(`${chalk.bold.green("💾 [write_file]")} ${chalk.underline(args.path ?? "")} ${chalk.dim(t("tool.linesSuffix", { count }))}`);
      break;
    }
    case "edit_file":
      console.log(`${chalk.bold.yellow("✏️  [edit_file]")} ${chalk.underline(args.path ?? "")} ${chalk.dim(t("tool.applyingChange"))}`);
      break;
    case "list_dir":
      console.log(`${chalk.bold.blue("📁 [list_dir]")} ${chalk.underline(args.path ?? ".")}`);
      break;
    case "search_code":
      console.log(`${chalk.bold.magenta("🔍 [search_code]")} ${chalk.dim(t("tool.searchingFor"))} '${args.query ?? ""}'`);
      break;
    case "run_command":
      console.log(`${chalk.bold.red("⚡ [run_command]")} ${chalk.bold.white(args.command ?? "")}`);
      break;
    case "code_intel":
      console.log(`${chalk.bold.cyan("🧭 [code_intel]")} ${chalk.dim(args.operation ?? "")} ${chalk.underline(args.path ?? "")}`);
      break;
    default:
      console.log(`${chalk.bold.magenta(`⚙️  [${toolName}]`)} ${chalk.dim(JSON.stringify(args))}`);
  }
}

export function printToolResult(toolName, result = {}) {
  if (!result.success) {
    printError(result.error || t("common.unknownError"));
    return;
  }

  if (toolName === "edit_file" && result.diff) {
    const body = highlightCode(result.diff, "diff").replace(/\n$/, "");
    console.log(boxen(body, {
      padding: { top: 0, bottom: 0, left: 1, right: 1 },
      borderStyle: "round",
      borderColor: GREEN,
      title: chalk.green(`Diff: ${result.path ?? ""}`),
      titleAlignment: "left",
    }));
    return;
  }

  switch (toolName) {
    case "read_file":
      console.log(chalk.dim(t("tool.readTotal", { count: result.total_lines ?? 0 })));
      break;
    case "write_file":
      console.log(chalk.dim(`↳ ${t("tool.written")}`));
      break;
    case "edit_file":
      console.log(chalk.dim(`↳ ${t("tool.updated")}`));
      break;
    case "list_dir":
      console.log(chalk.dim(t("tool.itemsListed", { count: result.total_items ?? 0 })));
      break;
    case "search_code":
      console.log(chalk.dim(t("tool.matchesFound", { count: result.match_count ?? 0 })));
      break;
    case "code_intel":
      console.log(chalk.dim(`↳ ${typeof result.count === "number" ? t("tool.results", { count: result.count }) : t("tool.done")}`));
      break;
    case "run_command": {
      const parts = [];
      const out = (result.stdout ?? "").trim();
      const err = (result.stderr ?? "").trim();
      const code = result.returncode ?? 0;
      if (out) parts.push(`${chalk.bold(t("tool.output"))}\n${out}`);
      if (err) parts.push(`${chalk.bold.red(t("tool.errorOutput"))}\n${err}`);
      parts.push(chalk.dim(t("tool.exitCodeLine", { code })));
      console.log(boxen(parts.join("\n\n"), {
        padding: { top: 0, bottom: 0, left: 1, right: 1 },
        borderStyle: "round",
        borderColor: code === 0 ? CYAN : RED,
        title: chalk.bold(t("tool.resultTitle")),
        titleAlignment: "left",
      }));
      break;
    }
    default:
      console.log(chalk.dim(`↳ ${JSON.stringify(result)}`));
  }
}

export function assistantPanel(text, typing = false) {
  const title = typing
    ? `${chalk.bold.green(t("assistant.name"))} ${chalk.dim(t("assistant.typing"))}`
    : chalk.bold.green(t("assistant.name"));
  const body = renderMarkdown(text) || chalk.dim("…");
  return boxen(body, {
    width: panelWidth(),
    padding: { top: 0, bottom: 0, left: 1, right: 1 },
    borderStyle: "round",
    borderColor: GREEN,
    title,
    titleAlignment: "left",
  });
}

export function createAssistantStream() {
  const live = new LiveWriter();
  return {
    update(text) {
      live.update(assistantPanel(text, true));
    },
    finish(text) {
      live.finish(assistantPanel(text, false));
    },
    clear() {
      live.clear();
    },
  };
}

export function printStats(items) {
  console.log(chalk.dim(items.map(([key, value]) => `${key}: ${value}`).join("  •  ")));
}

export function createPlainSink({ ask } = {}) {
  const stream = createAssistantStream();
  let spinner = null;

  const stopSpinner = () => {
    if (spinner) {
      spinner.stop();
      spinner = null;
    }
  };

  return {
    thinking(label = t("sink.thinking")) {
      stopSpinner();
      spinner = createSpinner(label);
      spinner.start();
    },
    assistantUpdate(text) {
      stopSpinner();
      stream.update(text);
    },
    assistantEnd(text) {
      stopSpinner();
      if (text && text.trim()) stream.finish(text);
      else stream.clear();
    },
    assistantClear() {
      stopSpinner();
      stream.clear();
    },
    toolCall(name, args) {
      stopSpinner();
      printToolCall(name, args);
    },
    toolResult(name, result) {
      printToolResult(name, result);
    },
    info(text) {
      stopSpinner();
      console.log(chalk.dim(text));
    },
    error(text) {
      stopSpinner();
      printError(text);
    },
    async askUser({ question, options }) {
      stopSpinner();
      console.log(chalk.bold(question));
      options.forEach((option, index) => {
        const label = option?.label ?? String(option);
        console.log(`  ${index + 1}. ${label}${option?.description ? chalk.dim(` — ${option.description}`) : ""}`);
      });
      if (!ask) return { answer: t("ask.noInterface") };
      const answer = (await ask(t("ask.prompt"))).trim();
      const index = Number(answer) - 1;
      if (Number.isInteger(index) && options[index]) {
        return { answer: options[index].label ?? String(options[index]) };
      }
      return { answer: answer || t("ask.notAnswered") };
    },
    async askPermission({ path: target, pattern }) {
      stopSpinner();
      console.log(chalk.bold.yellow(t("permission.title")));
      console.log(chalk.yellow(`  ${t("permission.accessExternal", { path: target })}`));
      console.log(chalk.dim(`  ${t("permission.patterns")}: ${pattern}`));
      if (!ask) return "reject";
      const answer = (await ask(t("permission.prompt"))).trim().toLowerCase();
      if (["o", "b", "once"].includes(answer)) return "once";
      if (["a", "h", "always"].includes(answer)) return "always";
      return "reject";
    },
    async askApproval(command) {
      stopSpinner();
      console.log(`${chalk.bold.yellow(t("sink.approvalTitle"))} ${chalk.bold.white(command)}`);
      if (!ask) return false;
      const answer = (await ask(t("sink.approvalPrompt"))).trim().toLowerCase();
      return ["e", "evet", "y", "yes"].includes(answer);
    },
  };
}

export { formatBytes };
