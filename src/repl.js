import readline from "node:readline";
import path from "node:path";
import fs from "node:fs";
import chalk from "chalk";
import * as ui from "./ui.js";
import {
  API_BASE_URL,
  getModelInfo,
  loadConfig,
  saveConfig,
  maskKey,
} from "./config.js";
import { resolvePath } from "./utils.js";
import { verifyApiKey } from "./account.js";
import { listSessions } from "./session.js";
import { startCancelScope, stopCancelScope } from "./cancel.js";
import { t, localeTag, setLocale, getLocale, LANGUAGES } from "./i18n/index.js";

const COMMANDS = [
  "/model", "/lang", "/key", "/compact", "/sessions", "/clear", "/help",
  "/history", "/exit", "/quit",
];

function createCompleter() {
  return (line) => {
    const trimmed = line ?? "";
    if (!trimmed.includes(" ") && trimmed.startsWith("/")) {
      const hits = COMMANDS.filter((cmd) => cmd.startsWith(trimmed));
      return [hits.length ? hits : COMMANDS, trimmed];
    }

    const tokens = trimmed.split(/\s+/);
    const last = tokens[tokens.length - 1] ?? "";
    const dirPart = /[/\\]/.test(last) ? path.dirname(last) : ".";
    const base = path.basename(last);

    let entries = [];
    try {
      entries = fs
        .readdirSync(resolvePath(dirPart), { withFileTypes: true })
        .filter((entry) => entry.name.startsWith(base) && !entry.name.startsWith("."))
        .map((entry) => entry.name + (entry.isDirectory() ? path.sep : ""));
    } catch {
      entries = [];
    }
    return [entries, last];
  };
}

export async function runRepl({ agent }) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    completer: createCompleter(),
    historySize: 200,
    terminal: Boolean(process.stdin.isTTY),
  });

  const queue = [];
  let waiter = null;
  let closed = false;

  const settle = (value) => {
    if (waiter) {
      const resolve = waiter;
      waiter = null;
      resolve(value);
    } else {
      queue.push(value);
    }
  };

  rl.on("line", (line) => settle(line));
  rl.on("close", () => {
    closed = true;
    if (waiter) {
      const resolve = waiter;
      waiter = null;
      resolve(null);
    }
  });
  rl.on("SIGINT", () => {
    process.stdout.write("\n");
    settle("__interrupt__");
  });

  const nextLine = (prompt) => {
    if (queue.length > 0) {
      return Promise.resolve(queue.shift());
    }
    if (closed) return Promise.resolve(null);
    return new Promise((resolve) => {
      waiter = resolve;
      rl.setPrompt(prompt);
      rl.prompt();
    });
  };

  const ask = async (question) => {
    const answer = await nextLine(question);
    return answer ?? "";
  };

  const sink = ui.createPlainSink({ ask });

  const handleModelSwitch = async () => {
    ui.printModelsTable(agent.modelId);
    const choice = (await ask(t("repl.modelPrompt"))).trim();
    if (!choice) return;
    const info = getModelInfo(choice);
    agent.setModel(info.id);
    saveConfig({ currentModel: info.id });
    ui.printSuccess(t("repl.modelChanged", { name: info.name, id: info.id }));
  };

  const handleLanguageSwitch = async () => {
    console.log(chalk.bold(t("lang.title")));
    LANGUAGES.forEach((lang, index) => {
      const active = lang.code === getLocale();
      console.log(`  ${index + 1}. ${lang.label}${active ? chalk.green(" ✓") : ""}`);
    });
    const choice = (await ask("> ")).trim();
    const picked = LANGUAGES[Number(choice) - 1];
    if (!picked) return;
    setLocale(picked.code);
    saveConfig({ language: picked.code });
    ui.printSuccess(t("lang.selected", { name: picked.label }));
  };

  const handleKeyUpdate = async () => {
    console.log(t("repl.currentKey", { key: chalk.yellow(maskKey(agent.apiKey)) }));
    const newKey = (await ask(t("repl.newKey"))).trim();
    if (!newKey) return;
    ui.printDim(t("onboarding.verifying"));
    const result = await verifyApiKey(newKey);
    if (!result.ok) {
      ui.printError(t(result.reason === "network" ? "onboarding.network" : "onboarding.invalid"));
      return;
    }
    agent.setApiKey(newKey);
    saveConfig({ apiKey: newKey });
    ui.printSuccess(t("repl.keyUpdated"));
    if (result.account?.name) ui.printDim(t("notices.apiKeyAccount", { name: result.account.name }));
  };

  while (true) {
    const info = getModelInfo(agent.modelId);
    const folder = path.basename(process.cwd()) || process.cwd();
    const line = await nextLine(`WenOX [${info.name} | ${folder}] > `);

    if (line === null) {
      console.log(chalk.cyan(`\n${t("repl.goodbye")}`));
      break;
    }
    if (line === "__interrupt__") {
      ui.printDim(t("ask.retry"));
      continue;
    }

    const input = line.trim();
    if (!input) continue;
    const lower = input.toLowerCase();

    if (["/exit", "/quit", "exit", "quit", "q"].includes(lower)) {
      console.log(chalk.cyan(t("repl.goodbye")));
      break;
    }
    if (lower === "/sessions") {
      const all = listSessions();
      if (all.length === 0) {
        ui.printDim(t("session.none"));
        continue;
      }
      ui.printDim(t("session.past"));
      all.slice(0, 15).forEach((item, index) => {
        ui.printDim(
          `  ${index + 1}. ${item.title || t("session.untitled")}  ·  ${new Date(item.updatedAt ?? Date.now()).toLocaleString(localeTag())}  ·  ${item.id}`,
        );
      });
      ui.printDim(t("session.pastHint"));
      continue;
    }
    if (lower === "/help") {
      ui.printHelp();
      continue;
    }
    if (lower === "/model") {
      await handleModelSwitch();
      continue;
    }
    if (lower === "/lang") {
      await handleLanguageSwitch();
      continue;
    }
    if (lower === "/key") {
      await handleKeyUpdate();
      continue;
    }
    if (lower === "/compact") {
      if (agent.messageCount === 0) {
        ui.printDim(t("compact.empty"));
        continue;
      }
      try {
        ui.printDim(t("compact.running"));
        await agent.compact();
        ui.printSuccess(t("compact.summarized"));
      } catch (error) {
        ui.printError(t("compact.failed", { message: error.message }));
      }
      continue;
    }
    if (lower === "/clear") {
      agent.clearHistory();
      console.clear();
      ui.printBanner({
        modelName: getModelInfo(agent.modelId).name,
        apiUrl: API_BASE_URL,
      });
      ui.printDim(t("context.chatCleared"));
      continue;
    }
    if (lower === "/history") {
      ui.printDim(t("context.messages", { count: agent.messageCount }));
      continue;
    }

    if (input.startsWith("/")) {
      ui.printError(t("notices.unknownCommand", { cmd: input.split(/\s+/)[0].replace(/^\//, "") }));
      continue;
    }

    startCancelScope();
    try {
      await agent.chatStep(input, sink);
    } catch (error) {
      ui.printError(t("notices.errorPrefix", { message: error.message }));
    } finally {
      stopCancelScope();
    }
  }

  rl.close();
}
