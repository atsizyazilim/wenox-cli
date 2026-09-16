import chalk from "chalk";
import boxen from "boxen";
import ora from "ora";
import type { Ora } from "ora";
import Table from "cli-table3";
import { LiveWriter } from "./live.js";
import { renderMarkdown, highlightCode } from "./markdown.js";
import { AVAILABLE_MODELS, API_BASE_URL } from "./config.js";
import { formatBytes } from "./utils.js";
import { t, localeTag } from "./i18n/index.js";
import type { AccountInfo } from "./account.js";

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

// boxen 8 `subtitle` seçeneğini kaldırdı: ne tipinde ne çalışma zamanı kodunda
// var, yani açılış ekranının model satırı ve banner'ın pencere alt başlığı hiç
// çizilmiyordu. Etkisiz bir seçenek geçirmemek için kaldırıldı; alt başlık
// istenirse boxen içeriğine ya da title'a eklenmeli.

// Sözlükteki bazı anahtarlar metin değil satır listesi tutuyor (`boot.steps`
// string[], `banner.commandRows` string[][]). `t()` metin döndürdüğü için bu
// değerler çağrı yerinde daraltılıyor; değerler aynen eskisi gibi kullanılıyor.
const list = (key: string): string[] => t(key) as unknown as string[];
const rows = (key: string): string[][] => t(key) as unknown as string[][];

function termColumns(): number {
  return process.stdout.columns || 80;
}

function panelWidth(): number {
  return Math.max(30, Math.min(termColumns() - 2, 110));
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export function createSpinner(text: string): Ora {
  return ora({ text, color: CYAN, spinner: "dots" });
}

export function printError(message: string): void {
  console.log(
    boxen(chalk.red(message), {
      padding: { top: 0, bottom: 0, left: 1, right: 1 },
      borderStyle: "round",
      borderColor: RED,
    }),
  );
}

export function printSuccess(message: string): void {
  console.log(`${chalk.bold.green("✓")} ${message}`);
}

export function printDim(message: string): void {
  console.log(chalk.dim(message));
}

export function printWarning(message: string): void {
  console.log(chalk.yellow(message));
}

export function welcomeMessage(account: AccountInfo | null | undefined): string {
  const name = typeof account?.name === "string" ? account.name.trim() : "";
  const lines = [
    name ? t("onboarding.welcomeNamed", { name }) : t("onboarding.welcomeAnon"),
  ];
  if (account?.premium) {
    const days = account.premium_days_remaining;
    lines.push(
      typeof days === "number"
        ? t("onboarding.premiumDays", { days })
        : t("onboarding.premium"),
    );
  } else {
    lines.push(t("onboarding.noPremium"));
  }
  if (typeof account?.credits_remaining === "number") {
    lines.push(
      t("onboarding.credits", {
        credits: account.credits_remaining.toLocaleString(localeTag()),
      }),
    );
  }
  return lines.join("\n");
}

function renderBar(pct: number, width: number, label: string): string {
  const filled = Math.max(0, Math.min(width, Math.round((pct / 100) * width)));
  const bar = chalk.cyan("█".repeat(filled)) + chalk.dim("░".repeat(width - filled));
  return `${bar} ${chalk.bold(String(pct).padStart(3))}%  ${chalk.dim(label)}`;
}

export async function showBootScreen(
  modelName = "",
  apiUrl = API_BASE_URL,
): Promise<void> {
  if (!process.stdout.isTTY) return;

  const width = panelWidth();
  const barWidth = Math.max(20, width - 26);
  const steps = list("boot.steps");

  process.stdout.write(
    `${boxen(chalk.bold.cyan(LOGO), {
      padding: { top: 0, bottom: 0, left: 1, right: 1 },
      borderStyle: "round",
      borderColor: CYAN,
      title: chalk.bold.white("W E N O X"),
      titleAlignment: "center",
      width,
    })}\n`,
  );

  const live = new LiveWriter();
  const total = steps.length;
  const substeps = 4;

  for (let i = 0; i < total; i += 1) {
    for (let f = 1; f <= substeps; f += 1) {
      const pct = Math.round(((i + f / substeps) / total) * 100);
      live.update(`${renderBar(pct, barWidth, steps[i])}\n${chalk.dim(`   ${apiUrl}`)}`);
      await sleep(38);
    }
    live.update(
      `${renderBar(Math.round(((i + 1) / total) * 100), barWidth, steps[i])}\n${chalk.dim(`   ${apiUrl}`)}`,
    );
  }

  live.finish(`${chalk.bold.green(t("boot.ready"))}\n${chalk.dim(t("boot.opening"))}`);
  await sleep(500);

  process.stdout.write("\x1b[2J\x1b[H");
}

function commandLine(cmd: string, desc: string): string {
  return `${chalk.bold.white(cmd.padEnd(14))} ${chalk.dim(`- ${desc}`)}`;
}

export function printBanner({
  modelName,
  apiUrl = API_BASE_URL,
}: {
  modelName: string;
  apiUrl?: string;
}): void {
  const now = new Date().toLocaleTimeString(localeTag());
  const content = [
    `${chalk.bold.cyan("WenOX AI CLI")}${chalk.dim(t("banner.tagline"))}`,
    chalk.dim("─".repeat(42)),
    `${chalk.bold(t("banner.apiEndpoint"))} ${chalk.dim(apiUrl)}`,
    `${chalk.bold(t("banner.activeModel"))} ${chalk.bold.green(modelName)}`,
    `${chalk.bold(t("banner.activeDir"))} ${chalk.yellow(process.cwd())}`,
    `${chalk.bold(t("banner.sessionLabel"))} ${chalk.dim(
      `${now}  •  ${t("banner.ready")}`,
    )}`,
    chalk.dim("─".repeat(42)),
    chalk.bold.yellow(t("banner.commandsTitle")),
    ...rows("banner.commandRows").map(([cmd, desc]) => commandLine(cmd, desc)),
    "",
    chalk.bold.cyan(t("banner.hint")),
  ].join("\n");

  console.log(
    boxen(content, {
      padding: { top: 1, bottom: 1, left: 2, right: 2 },
      borderStyle: "round",
      borderColor: CYAN,
      title: chalk.bold.white(t("banner.windowTitle")),
      titleAlignment: "center",
    }),
  );
}

export function printHelp(): void {
  const table = new Table({
    head: [
      chalk.bold.yellow(t("help.tableCommand")),
      chalk.bold.white(t("help.tableDescription")),
    ],
    style: { head: [], border: [CYAN] },
    colWidths: [22, 62],
    wordWrap: true,
  });
  table.push(...rows("help.commandRows"));
  console.log(table.toString());
}

export function printModelsTable(currentId: string): void {
  const headColors: ((text: string) => string)[] = [
    chalk.bold.cyan,
    chalk.bold.white,
    chalk.bold.magenta,
    chalk.bold.white,
    chalk.bold.yellow,
  ];
  const table = new Table({
    head: list("models.head").map((label, i) => headColors[i](label)),
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

export function printToolCall(
  toolName: string,
  args: Record<string, unknown> = {},
): void {
  switch (toolName) {
    case "read_file": {
      const range = args.start_line
        ? ` (${String(args.start_line)}-${String(args.end_line ?? t("tool.rangeEnd"))})`
        : "";
      console.log(
        `${chalk.bold.cyan("📖 [read_file]")} ${chalk.underline(
          String(args.path ?? ""),
        )}${chalk.dim(range)}`,
      );
      break;
    }
    case "write_file": {
      const count = String(args.content ?? "").split("\n").length;
      console.log(
        `${chalk.bold.green("💾 [write_file]")} ${chalk.underline(
          String(args.path ?? ""),
        )} ${chalk.dim(t("tool.linesSuffix", { count }))}`,
      );
      break;
    }
    case "edit_file":
      console.log(
        `${chalk.bold.yellow("✏️  [edit_file]")} ${chalk.underline(
          String(args.path ?? ""),
        )} ${chalk.dim(t("tool.applyingChange"))}`,
      );
      break;
    case "list_dir":
      console.log(
        `${chalk.bold.blue("📁 [list_dir]")} ${chalk.underline(
          String(args.path ?? "."),
        )}`,
      );
      break;
    case "search_code":
      console.log(
        `${chalk.bold.magenta("🔍 [search_code]")} ${chalk.dim(
          t("tool.searchingFor"),
        )} '${String(args.query ?? "")}'`,
      );
      break;
    case "run_command":
      console.log(
        `${chalk.bold.red("⚡ [run_command]")} ${chalk.bold.white(
          String(args.command ?? ""),
        )}`,
      );
      break;
    case "code_intel":
      console.log(
        `${chalk.bold.cyan("🧭 [code_intel]")} ${chalk.dim(
          String(args.operation ?? ""),
        )} ${chalk.underline(String(args.path ?? ""))}`,
      );
      break;
    default:
      console.log(
        `${chalk.bold.magenta(`⚙️  [${toolName}]`)} ${chalk.dim(JSON.stringify(args))}`,
      );
  }
}

export function printToolResult(
  toolName: string,
  result: Record<string, unknown> = {},
): void {
  if (!result.success) {
    printError(String(result.error || t("common.unknownError")));
    return;
  }

  if (toolName === "edit_file" && result.diff) {
    const body = highlightCode(String(result.diff), "diff").replace(/\n$/, "");
    console.log(
      boxen(body, {
        padding: { top: 0, bottom: 0, left: 1, right: 1 },
        borderStyle: "round",
        borderColor: GREEN,
        title: chalk.green(`Diff: ${String(result.path ?? "")}`),
        titleAlignment: "left",
      }),
    );
    return;
  }

  switch (toolName) {
    case "read_file":
      console.log(
        chalk.dim(t("tool.readTotal", { count: Number(result.total_lines ?? 0) })),
      );
      break;
    case "write_file":
      console.log(chalk.dim(`↳ ${t("tool.written")}`));
      break;
    case "edit_file":
      console.log(chalk.dim(`↳ ${t("tool.updated")}`));
      break;
    case "list_dir":
      console.log(
        chalk.dim(t("tool.itemsListed", { count: Number(result.total_items ?? 0) })),
      );
      break;
    case "search_code":
      console.log(
        chalk.dim(t("tool.matchesFound", { count: Number(result.match_count ?? 0) })),
      );
      break;
    case "code_intel":
      console.log(
        chalk.dim(
          `↳ ${
            typeof result.count === "number"
              ? t("tool.results", { count: result.count })
              : t("tool.done")
          }`,
        ),
      );
      break;
    case "run_command": {
      const parts: string[] = [];
      const out = String(result.stdout ?? "").trim();
      const err = String(result.stderr ?? "").trim();
      const code = Number(result.returncode ?? 0);
      if (out) parts.push(`${chalk.bold(t("tool.output"))}\n${out}`);
      if (err) parts.push(`${chalk.bold.red(t("tool.errorOutput"))}\n${err}`);
      parts.push(chalk.dim(t("tool.exitCodeLine", { code })));
      console.log(
        boxen(parts.join("\n\n"), {
          padding: { top: 0, bottom: 0, left: 1, right: 1 },
          borderStyle: "round",
          borderColor: code === 0 ? CYAN : RED,
          title: chalk.bold(t("tool.resultTitle")),
          titleAlignment: "left",
        }),
      );
      break;
    }
    default:
      console.log(chalk.dim(`↳ ${JSON.stringify(result)}`));
  }
}

export function assistantPanel(text: string, typing = false): string {
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

export interface AssistantStream {
  update(text: string): void;
  finish(text: string): void;
  clear(): void;
}

export function createAssistantStream(): AssistantStream {
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

export function printStats(items: [string, unknown][]): void {
  console.log(chalk.dim(items.map(([key, value]) => `${key}: ${value}`).join("  •  ")));
}

export interface AskUserRequest {
  question: string;
  options: { label?: string; description?: string }[];
}

export interface AskUserAnswer {
  answer: string;
  cancelled?: boolean;
}

export interface AskPermissionRequest {
  tool?: string;
  path?: string;
  resolved?: string;
  grant?: string;
  pattern?: string;
}

export type PermissionDecision = "once" | "always" | "reject";

export function createPlainSink({
  ask,
}: {
  ask?: (question: string) => Promise<string>;
} = {}) {
  const stream = createAssistantStream();
  let spinner: Ora | null = null;

  const stopSpinner = (): void => {
    if (spinner) {
      spinner.stop();
      spinner = null;
    }
  };

  return {
    thinking(label: string = t("sink.thinking")): void {
      stopSpinner();
      spinner = createSpinner(label);
      spinner.start();
    },
    assistantUpdate(text: string): void {
      stopSpinner();
      stream.update(text);
    },
    assistantEnd(text: string): void {
      stopSpinner();
      if (text && text.trim()) stream.finish(text);
      else stream.clear();
    },
    assistantClear(): void {
      stopSpinner();
      stream.clear();
    },
    toolCall(name: string, args: Record<string, unknown>): void {
      stopSpinner();
      printToolCall(name, args);
    },
    toolResult(name: string, result: Record<string, unknown>): void {
      printToolResult(name, result);
    },
    info(text: string): void {
      stopSpinner();
      console.log(chalk.dim(text));
    },
    error(text: string): void {
      stopSpinner();
      printError(text);
    },
    async askUser({ question, options }: AskUserRequest): Promise<AskUserAnswer> {
      stopSpinner();
      console.log(chalk.bold(question));
      options.forEach((option, index) => {
        const label = option?.label ?? String(option);
        console.log(
          `  ${index + 1}. ${label}${
            option?.description ? chalk.dim(` — ${option.description}`) : ""
          }`,
        );
      });
      if (!ask) return { answer: t("ask.noInterface") };
      const answer = (await ask(t("ask.prompt"))).trim();
      const index = Number(answer) - 1;
      if (Number.isInteger(index) && options[index]) {
        return { answer: options[index].label ?? String(options[index]) };
      }
      return { answer: answer || t("ask.notAnswered") };
    },
    async askPermission({
      path: target,
      pattern,
    }: AskPermissionRequest): Promise<PermissionDecision> {
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
    async askApproval(command: string): Promise<boolean> {
      stopSpinner();
      console.log(`${chalk.bold.yellow(t("sink.approvalTitle"))} ${chalk.bold.white(command)}`);
      if (!ask) return false;
      const answer = (await ask(t("sink.approvalPrompt"))).trim().toLowerCase();
      return ["e", "evet", "y", "yes"].includes(answer);
    },
  };
}

export { formatBytes };
