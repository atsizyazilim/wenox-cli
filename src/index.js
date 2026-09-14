import fs from "node:fs";
import { parseArgs } from "node:util";
import { createRequire } from "node:module";
import readline from "node:readline/promises";
import chalk from "chalk";
import boxen from "boxen";
import {
  API_BASE_URL,
  AVAILABLE_MODELS,
  DEFAULT_MODEL_ID,
  getModelInfo,
  loadConfig,
  saveConfig,
} from "./config.js";
import { WenOXAgent, getSystemPrompt } from "./agent.js";
import { runRepl } from "./repl.js";
import { changeDirectory } from "./tools.js";
import { createSession, loadSession, saveSession } from "./session.js";
import { startCancelScope, stopCancelScope } from "./cancel.js";
import { isUnsafeWorkspace } from "./workspace.js";
import { checkForUpdate, UPGRADE_COMMAND } from "./update.js";
import { t, setLocale, detectLanguage } from "./i18n/index.js";
import * as ui from "./ui.js";

const require = createRequire(import.meta.url);
const pkg = require("../package.json");

function helpText() {
  return `${chalk.bold.cyan("WenOX AI CLI")} ${chalk.dim(`v${pkg.version}`)} ${t("help.cliSubtitle")}

${chalk.bold(t("help.usage"))}
  ${t("help.usageLine")}

${chalk.bold(t("help.options"))}
${t("help.optionLines").map((line) => `  ${line}`).join("\n")}

${chalk.bold(t("help.examples"))}
${t("help.exampleLines").map((line) => `  ${line}`).join("\n")}`;
}

function parseCliArgs(argv) {
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
        prompt: { type: "string", short: "p" },
        version: { type: "boolean", short: "v" },
        help: { type: "boolean", short: "h" },
      },
    });
  } catch (error) {
    console.error(chalk.red(t("cli.argError", { message: error.message })));
    console.log(helpText());
    process.exit(1);
  }
}

// Anahtar yoksa onboarding, TUI içindeki Onboarding ekranında tamamlanır (src/tui/root.js)

function createLineReader() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const queue = [];
  let waiter = null;
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
      if (queue.length > 0) return Promise.resolve(queue.shift());
      if (closed) return Promise.resolve("");
      return new Promise((resolve) => {
        waiter = resolve;
        rl.setPrompt(prompt);
        rl.prompt();
      });
    },
    close: () => rl.close(),
  };
}

function printSessionFooter(session) {
  if (!session) return;
  const hasContent = (session.items ?? []).length > 0 || (session.messages ?? []).length > 0;
  if (!hasContent) return;

  saveSession(session);

  console.log("");
  if (session.title) console.log(`  ${chalk.dim("Session")}   ${chalk.bold(session.title)}`);
  console.log(`  ${chalk.dim("Continue")}  ${chalk.cyan(`wenox -s ${session.id}`)}`);
  console.log("");
}

function printUpdateRequired({ current, latest }) {
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

async function resolveApiKey(values) {
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

async function main() {
  setLocale(detectLanguage(loadConfig().language));
  const { values } = parseCliArgs(process.argv.slice(2));

  if (values.help) {
    console.log(boxen(helpText(), {
      padding: { top: 1, bottom: 1, left: 2, right: 2 },
      borderStyle: "round",
      borderColor: "cyan",
      title: chalk.bold.white("W E N O X"),
      titleAlignment: "center",
    }));
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
      await launchUpdateScreen({ current: update.current, latest: update.latest });
    } else {
      printUpdateRequired(update);
      process.exitCode = 1;
    }
    return;
  }

  const apiKey = await resolveApiKey(values);

  let session = values.session ? loadSession(values.session) : null;
  if (values.session && !session) {
    ui.printError(t("session.notFound", { id: values.session }));
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

  if (values.cwd) {
    const result = changeDirectory(values.cwd);
    if (!result.success) ui.printError(result.error);
  }

  if (!session) {
    session = createSession({ cwd: process.cwd(), model: modelInfo.id });
  } else {
    session.cwd = process.cwd();
  }

  if (values.prompt) {
    const reader = createLineReader();
    const sink = ui.createPlainSink({ ask: (question) => reader.ask(question) });
    const stopScope = startCancelScope();
    try {
      await agent.chatStep(values.prompt, sink);
    } finally {
      stopCancelScope();
      reader.close();
    }
    session.messages = agent.messages.slice(1);
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

main().catch((error) => {
  console.error(chalk.red(t("cli.unexpectedError", { message: error?.stack ?? error })));
  process.exitCode = 1;
});
