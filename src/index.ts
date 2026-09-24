import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import readline from "node:readline/promises";
import chalk from "chalk";
import boxen from "boxen";
import {
  API_BASE_URL,
  DEFAULT_MODEL_ID,
  getModelInfo,
  loadConfig,
  saveConfig,
} from "./config.js";
import { WenOXAgent, getSystemPrompt } from "./agent.js";
import { runRepl } from "./repl.js";
import { changeDirectory } from "./tools.js";
import {
  createSession,
  loadSession,
  saveSession,
  setCurrentSessionId,
  listSessions,
  messageText,
} from "./session.js";
import { runSubcommand } from "./cli-commands.js";
import type { Session } from "./session.js";
import { startCancelScope, stopCancelScope } from "./cancel.js";
import { isUnsafeWorkspace } from "./workspace.js";
import { checkForUpdate, UPGRADE_COMMAND } from "./update.js";
import { t, tList, setLocale, detectLanguage } from "./i18n/index.js";
import * as ui from "./ui.js";
import { findPackageJson, errorProp } from "./utils.js";

// Manifest derinliğe bağlı olmadan bulunur: kaynak ağacında (src/), derlenmiş
// çıktıda (dist/src/) ve global kurulumda aynı şekilde çalışır.
const manifestPath = findPackageJson(
  path.dirname(fileURLToPath(import.meta.url)),
  "@wenox/cli",
);
if (!manifestPath) {
  throw new Error("Could not locate the @wenox/cli package manifest.");
}
const pkg = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as { version: string };

function helpText(): string {
  return `${chalk.bold.cyan("WenOX AI CLI")} ${chalk.dim(`v${pkg.version}`)} ${t("help.cliSubtitle")}

${chalk.bold(t("help.usage"))}
  ${t("help.usageLine")}

${chalk.bold(t("help.options"))}
${tList("help.optionLines").map((line) => `  ${line}`).join("\n")}

${chalk.bold(t("help.commands"))}
${tList("help.commandLines").map((line) => `  ${line}`).join("\n")}

${chalk.bold(t("help.examples"))}
${tList("help.exampleLines").map((line) => `  ${line}`).join("\n")}`;
}

function parseCliArgs(argv: string[]) {
  try {
    return parseArgs({
      args: argv,
      allowPositionals: true,
      strict: true,
      options: {
        model: { type: "string", short: "m" },
        key: { type: "string", short: "k" },
        session: { type: "string", short: "s" },
        cwd: { type: "string", short: "d" },
        "auto-approve": { type: "boolean", short: "y" },
        continue: { type: "boolean", short: "c" },
        fork: { type: "boolean" },
        format: { type: "string" },
        prompt: { type: "string", short: "p" },
        version: { type: "boolean", short: "v" },
        help: { type: "boolean", short: "h" },
        debug: { type: "boolean" },
      },
    });
  } catch (error) {
    console.error(chalk.red(t("cli.argError", { message: String(errorProp(error, "message")) })));
    console.log(helpText());
    process.exit(1);
  }
}

// Anahtar yoksa onboarding, TUI içindeki Onboarding ekranında tamamlanır (src/tui/root.tsx)

interface LineReader {
  ask(prompt: string): Promise<string>;
  close(): void;
}

function createLineReader(): LineReader {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const queue: string[] = [];
  let waiter: ((line: string) => void) | null = null;
  let closed = false;

  rl.on("line", (line) => {
    if (waiter) {
      const resolve = waiter;
      waiter = null;
      resolve(line);
    } else {
      queue.push(line);
    }
  });
  rl.on("close", () => {
    closed = true;
    if (waiter) {
      const resolve = waiter;
      waiter = null;
      resolve("");
    }
  });

  return {
    ask: (prompt) => {
      if (queue.length > 0) return Promise.resolve(queue.shift() ?? "");
      if (closed) return Promise.resolve("");
      return new Promise<string>((resolve) => {
        waiter = resolve;
        rl.setPrompt(prompt);
        rl.prompt();
      });
    },
    close: () => rl.close(),
  };
}

function printSessionFooter(session: Session | null | undefined): void {
  if (!session) return;
  const hasContent = (session.items ?? []).length > 0 || (session.messages ?? []).length > 0;
  if (!hasContent) return;

  saveSession(session);

  console.log("");
  if (session.title) console.log(`  ${chalk.dim("Session")}   ${chalk.bold(session.title)}`);
  console.log(`  ${chalk.dim("Continue")}  ${chalk.cyan(`wenox -s ${session.id}`)}`);
  console.log("");
}

function printUpdateRequired({
  current,
  latest,
}: {
  current?: string;
  latest?: string;
}): void {
  console.error(
    boxen(
      `${t("update.forced", { current, latest })}

  ${chalk.cyan(UPGRADE_COMMAND)}`,
      {
        padding: { top: 1, bottom: 1, left: 2, right: 2 },
        borderStyle: "round",
        borderColor: "yellow",
        title: chalk.bold.white(t("update.title")),
        titleAlignment: "center",
      },
    ),
  );
}

async function resolveApiKey(values: { key?: string }): Promise<string> {
  const provided = values.key?.trim();
  if (provided) {
    saveConfig({ apiKey: provided });
    return provided;
  }

  const existing = loadConfig().apiKey;
  if (existing) return existing;

  if (!(process.stdout.isTTY && process.stdin.isTTY)) {
    console.error(chalk.red(t("onboarding.noTty")));
    process.exit(1);
  }

  // İnteraktif: anahtar TUI içindeki onboarding ekranında alınır
  return "";
}

async function main(): Promise<void> {
  const { values: early } = parseCliArgs(process.argv.slice(2));
  // Tanı kaydı en baştan açılmalı: --debug bayrağı env değişkeniyle aynı işi yapar.
  if (early.debug) process.env.WENOX_DEBUG = "1";

  const startupConfig = loadConfig();
  setLocale(detectLanguage(startupConfig.language));
  applyTheme(startupConfig.theme);
  const { values, positionals } = parseCliArgs(process.argv.slice(2));

  if (values.help) {
    console.log(
      boxen(helpText(), {
        padding: { top: 1, bottom: 1, left: 2, right: 2 },
        borderStyle: "round",
        borderColor: "cyan",
        title: chalk.bold.white("W E N O X"),
        titleAlignment: "center",
      }),
    );
    return;
  }

  if (values.version) {
    console.log(`WenOX CLI v${pkg.version}`);
    return;
  }

  const update = await checkForUpdate({ current: pkg.version });
  if (update.outdated) {
    if (process.stdout.isTTY && process.stdin.isTTY) {
      const { launchUpdateScreen } = await import("./tui/launch.js");
      await launchUpdateScreen({
        current: update.current ?? "",
        latest: update.latest ?? "",
      });
    } else {
      printUpdateRequired(update);
      process.exitCode = 1;
    }
    return;
  }

  // Alt komutlar (models/sessions/stats/mcp) TUI'yi hiç açmadan çalışır ve
  // anahtar doğrulaması istemez; yalnızca `models` kayıtlı anahtarı kullanır.
  const [subcommand, ...subRest] = positionals.map(String);
  if (subcommand) {
    const handled = await runSubcommand(subcommand, subRest, {
      apiKey: loadConfig().apiKey,
      currentModel: loadConfig().currentModel,
      json: values.format === "json",
    });
    if (handled) return;
  }

  const apiKey = await resolveApiKey(values);

  let session = values.session ? loadSession(values.session) : null;
  if (values.session && !session) {
    ui.printError(t("session.notFound", { id: values.session }));
  }

  // -c/--continue: en son oturuma devam et. --fork: o oturumun kopyası olarak
  // yeni bir oturum aç (geçmiş korunur, kimlik ayrılır).
  if (!session && (values.continue || values.fork)) {
    session = listSessions()[0] ?? null;
    if (!session) ui.printError(t("session.none"));
  }
  if (values.fork && session) {
    const source = session;
    const forked = createSession({ cwd: source.cwd, model: source.model });
    forked.title = source.title;
    forked.messages = [...(source.messages ?? [])];
    forked.items = [...(source.items ?? [])];
    forked.todos = [...(source.todos ?? [])];
    session = forked;
    ui.printSuccess(t("session.forked", { id: forked.id, from: source.id }));
  }
  if (session?.cwd && fs.existsSync(session.cwd)) {
    try {
      process.chdir(session.cwd);
    } catch {
      // dizin yoksa mevcut dizinde devam
    }
  }

  const modelInfo = getModelInfo(
    values.model || session?.model || loadConfig().currentModel || DEFAULT_MODEL_ID,
  );

  const agent = new WenOXAgent({
    apiKey,
    modelId: modelInfo.id,
    autoApprove: Boolean(values["auto-approve"]),
  });

  if (session?.messages?.length) {
    agent.messages = [{ role: "system", content: getSystemPrompt() }, ...session.messages];
  }

  // MCP sunucularına bağlan; bağlanamayanlar uyarı olarak gösterilir.
  const mcpErrors = await agent.loadMcp();
  for (const message of mcpErrors) ui.printWarning(t("cli.mcpFailed", { message }));

  if (values.cwd) {
    const result = changeDirectory(values.cwd);
    if (!result.success) ui.printError(result.error ?? "");
  }

  if (!session) {
    session = createSession({ cwd: process.cwd(), model: modelInfo.id });
  } else {
    session.cwd = process.cwd();
  }
  setCurrentSessionId(session.id);

  if (values.prompt) {
    const asJson = values.format === "json";
    // JSON modunda insan için yazılan akış bastırılır; sonuç en sonda JSON olur.
    const reader = asJson ? null : createLineReader();
    const sink = asJson
      ? {}
      : ui.createPlainSink({ ask: (question) => reader?.ask(question) ?? Promise.resolve("") });
    startCancelScope();
    try {
      await agent.chatStep(values.prompt, sink);
    } finally {
      stopCancelScope();
      reader.close();
    }
    session.messages = agent.messages.slice(1);
    if (asJson) {
      const last = [...agent.messages].reverse().find((message) => message.role === "assistant");
      console.log(
        JSON.stringify(
          {
            session: session.id,
            model: agent.modelId,
            cwd: process.cwd(),
            content: last ? messageText(last) : "",
          },
          null,
          2,
        ),
      );
      saveSession(session);
      return;
    }
    printSessionFooter(session);
    return;
  }

  if (process.stdout.isTTY && process.stdin.isTTY) {
    const { launchTui } = await import("./tui/launch.js");
    agent.setMode("plan"); // interaktif oturum Plan (salt-okunur) modda açılır
    const finished = await launchTui({
      agent,
      version: pkg.version,
      modelId: agent.modelId,
      autoApprove: Boolean(values["auto-approve"]),
      session,
    });
    printSessionFooter(finished ?? session);
    return;
  }

  await ui.showBootScreen(modelInfo.name, API_BASE_URL);
  ui.printBanner({ modelName: getModelInfo(agent.modelId).name, apiUrl: API_BASE_URL });
  if (isUnsafeWorkspace(process.cwd())) {
    ui.printWarning(t("notices.unsafeDir", { cwd: process.cwd() }));
  }
  await runRepl({ agent });
  session.messages = agent.messages.slice(1);
  printSessionFooter(session);
}

main().catch((error: unknown) => {
  console.error(
    chalk.red(
      t("cli.unexpectedError", {
        message: String(errorProp(error, "stack") ?? error),
      }),
    ),
  );
  process.exitCode = 1;
});
