import path from "node:path";
import OpenAI from "openai";
import { API_BASE_URL, DEFAULT_MODEL_ID, getModelInfo } from "./config.js";
import { TOOLS_SCHEMA, executeTool } from "./tools.js";
import { sanitizeOutput } from "./utils.js";
import { t } from "./i18n/index.js";
import { loadGrants, addGrant } from "./permissions.js";
import {
  isCancelled,
  resetCancel,
  setAbortHandler,
  clearAbortHandler,
} from "./cancel.js";

const MAX_TURNS = 100;
const RENDER_INTERVAL_MS = 50;
const FALLBACK_RESPONSE = () => t("agent.fallback");

const PATH_TOOLS = new Set(["read_file", "write_file", "edit_file", "list_dir", "search_code"]);
const DENIED_EXTERNAL = "User denied access to a path outside the project directory.";

function withinProject(targetPath, root) {
  const abs = path.resolve(root, String(targetPath));
  const rel = path.relative(root, abs);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

export function getSystemPrompt() {
  const cwd = process.cwd();
  return `You are WenOX AI. You are an advanced AI Coding Assistant developed by WenOX.
If asked who you are, your answer is always: "I am WenOX AI, developed by WenOX." Never state any other name.
You have direct access to the local file system and can use the tools below to inspect projects, read files, edit files, and run commands.

Environment:
- Operating System: ${process.platform === "win32" ? "Windows" : process.platform}
- Working / Project Directory: ${cwd}

Your Available Tools:
1. \`read_file\`: Reads a file's contents with line numbers. You MUST use this to inspect or edit a file.
2. \`write_file\`: Creates a new file or overwrites an existing file.
3. \`edit_file\`: Safely replaces a specific code block (target) in a file with a new one (replacement).
4. \`list_dir\`: Lists files and folders in the project.
5. \`search_code\`: Searches file contents for a keyword or regex.
6. \`run_command\`: Runs a shell command in the terminal.
7. \`ask_user\`: Asks the user a multiple-choice question (when a genuine preference is needed).

Your Working Principles:
- BE ACTION-ORIENTED: Never say things like "I will inspect with this command: ..." and dump command text. If you want to list files, search, or run a command, CALL YOUR TOOL DIRECTLY instead of writing it out as text.
- NEVER enter infinite loops repeating the same file extensions, command parameters, or words.
- When the user says "look at the build files", "check the build log", "read the error", immediately inspect the relevant build files such as \`build.log\` or \`.sln\` in the project directly with \`read_file\` or \`list_dir\`.
- Use file paths appropriate to the operating system; do NOT use Linux-specific \`/tmp/...\` paths on Windows.
- When you want to create a new file, NEVER run \`echo ... > file\` in the terminal; use the \`write_file\` tool directly.
- Do not ramble; focus directly on the result, be clear and professional.
- Do NOT NAG the user with unnecessary questions. If something is unclear, proceed with a reasonable assumption and state it. However, if a genuine preference/decision is needed (e.g. two different directions, which file/technology, style), use \`ask_user\` to ask a short question with 2-4 options; do not guess and go down the wrong path without asking.
- Always respond in the same language the user writes in.
- Always write characters correctly in UTF-8, never produce garbled characters (including Turkish characters such as ı, İ, ş, ğ, ü, ö, ç when replying in Turkish).`;
}

function parseToolArgs(raw) {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export class WenOXAgent {
  constructor({ apiKey, modelId = DEFAULT_MODEL_ID, autoApprove = false }) {
    this.apiKey = apiKey;
    this.modelId = modelId;
    this.autoApprove = autoApprove;
    this.client = new OpenAI({ apiKey, baseURL: API_BASE_URL });
    this.messages = [{ role: "system", content: getSystemPrompt() }];
    this.projectRoot = process.cwd();
    this.allowedExternal = new Set(loadGrants(this.projectRoot));
  }

  setModel(modelId) {
    this.modelId = modelId;
  }

  setApiKey(apiKey) {
    this.apiKey = apiKey;
    this.client = new OpenAI({ apiKey, baseURL: API_BASE_URL });
  }

  clearHistory() {
    this.messages = [{ role: "system", content: getSystemPrompt() }];
  }

  updateCwd() {
    if (this.messages[0]?.role === "system") {
      this.messages[0] = { role: "system", content: getSystemPrompt() };
    }
    this.projectRoot = process.cwd();
    this.allowedExternal = new Set(loadGrants(this.projectRoot));
  }

  get messageCount() {
    return Math.max(0, this.messages.length - 1);
  }

  #isExternalAllowed(abs) {
    for (const root of this.allowedExternal) {
      if (abs === root || abs.startsWith(root + path.sep)) return true;
    }
    return false;
  }

  async #ensurePathAccess(toolName, args, sink) {
    if (!PATH_TOOLS.has(toolName) || !args?.path) return true;
    const root = this.projectRoot;
    if (withinProject(args.path, root)) return true;

    const abs = path.resolve(root, String(args.path));
    if (this.#isExternalAllowed(abs)) return true;

    const isDirTool = toolName === "list_dir" || toolName === "search_code";
    const grant = isDirTool ? abs : path.dirname(abs);
    const pattern = `${grant}${path.sep}*`;

    const decision = sink.askPermission
      ? await sink.askPermission({ tool: toolName, path: args.path, resolved: abs, grant, pattern })
      : "reject";

    if (decision === "always") {
      this.allowedExternal.add(grant);
      addGrant(this.projectRoot, grant);
      return true;
    }
    return decision === "once";
  }

  async #streamCompletion(sink, modelName) {
    sink.thinking?.(t("agent.thinking", { model: modelName }));

    const params = {
      model: this.modelId,
      messages: this.messages,
      tools: TOOLS_SCHEMA,
      tool_choice: "auto",
      temperature: 0.3,
      stream: true,
    };

    const controller = new AbortController();
    const requestOptions = { signal: controller.signal };
    setAbortHandler(() => controller.abort());

    const startedAt = Date.now();

    try {
      let stream;

      if (this.supportsUsage === false) {
        stream = await this.client.chat.completions.create(params, requestOptions);
      } else {
        try {
          stream = await this.client.chat.completions.create(
            { ...params, stream_options: { include_usage: true } },
            requestOptions,
          );
        } catch (error) {
          if (error?.status === 400 || /stream_options/i.test(error?.message ?? "")) {
            this.supportsUsage = false;
            stream = await this.client.chat.completions.create(params, requestOptions);
          } else {
            throw error;
          }
        }
      }

      let content = "";
      let usage = null;
      let firstTokenAt = null;
      const toolCalls = [];
      let lastRender = 0;

      for await (const chunk of stream) {
        if (chunk.usage) usage = chunk.usage;

        if (isCancelled()) {
          try {
            controller.abort();
          } catch {
            // ignore
          }
          break;
        }

        const delta = chunk.choices?.[0]?.delta;
        if (!delta) continue;

        if (delta.content) {
          if (!firstTokenAt) firstTokenAt = Date.now();
          content += delta.content;
          const now = Date.now();
          if (now - lastRender >= RENDER_INTERVAL_MS) {
            lastRender = now;
            sink.assistantUpdate?.(content);
          }
        }

        if (Array.isArray(delta.tool_calls)) {
          for (const call of delta.tool_calls) {
            const index = call.index ?? 0;
            if (!toolCalls[index]) toolCalls[index] = { id: "", name: "", arguments: "" };
            if (call.id) toolCalls[index].id = call.id;
            if (call.function?.name && !toolCalls[index].name) {
              toolCalls[index].name = call.function.name;
            }
            if (call.function?.arguments) {
              toolCalls[index].arguments += call.function.arguments;
            }
          }
        }
      }

      const promptChars = this.messages.reduce(
        (sum, message) => sum + String(message.content ?? "").length,
        0,
      );
      const meta = {
        durationMs: Date.now() - startedAt,
        thinkingMs: firstTokenAt ? firstTokenAt - startedAt : undefined,
        modelName,
        usage:
          usage ??
          {
            prompt_tokens: Math.ceil(promptChars / 4),
            completion_tokens: Math.ceil(content.length / 4),
            total_tokens: Math.ceil((promptChars + content.length) / 4),
            estimated: true,
          },
      };

      return { content, toolCalls, meta };
    } finally {
      clearAbortHandler();
    }
  }

  async chatStep(userPrompt, sink = {}) {
    resetCancel();
    this.messages.push({ role: "user", content: userPrompt });

    for (let turn = 0; turn < MAX_TURNS; turn += 1) {
      if (isCancelled()) {
        sink.assistantClear?.();
        sink.info?.(t("agent.cancelled"));
        return;
      }

      const modelInfo = getModelInfo(this.modelId);
      let result;
      try {
        result = await this.#streamCompletion(sink, modelInfo.name);
      } catch (error) {
        sink.assistantClear?.();
        this.#reportError(error, sink);
        return;
      }

      if (isCancelled()) {
        sink.assistantClear?.();
        sink.info?.(t("agent.cancelled"));
        return;
      }

      const { content, toolCalls, meta } = result;
      const activeCalls = toolCalls.filter(Boolean);

      if (activeCalls.length > 0) {
        sink.assistantEnd?.(content, meta);

        this.messages.push({
          role: "assistant",
          content: content || "",
          tool_calls: activeCalls.map((call) => ({
            id: call.id,
            type: "function",
            function: { name: call.name, arguments: call.arguments },
          })),
        });

        for (const call of activeCalls) {
          if (isCancelled()) {
            sink.info?.(t("agent.cancelledTools"));
            return;
          }

          const args = parseToolArgs(call.arguments);
          sink.toolCall?.(call.name, args);

          let allowed = true;
          try {
            allowed = await this.#ensurePathAccess(call.name, args, sink);
          } catch {
            allowed = false;
          }

          let toolResult;
          if (!allowed) {
            toolResult = { success: false, error: DENIED_EXTERNAL };
          } else {
            try {
              if (call.name === "ask_user") {
                const options = Array.isArray(args.options) ? args.options : [];
                const response = sink.askUser
                  ? await sink.askUser({ question: args.question ?? "", options })
                  : { answer: t("ask.noInterface") };
                toolResult = {
                  success: !response.cancelled,
                  question: args.question ?? "",
                  answer: response.answer,
                };
              } else if (call.name === "run_command" && !this.autoApprove) {
                const approved = sink.askApproval ? await sink.askApproval(args.command ?? "") : false;
                toolResult = approved
                  ? await executeTool("run_command", args)
                  : { success: false, error: "User rejected running this command." };
              } else {
                toolResult = await executeTool(call.name, args);
              }
            } catch (error) {
              toolResult = { success: false, error: error.message };
            }
          }

          sink.toolResult?.(call.name, toolResult);

          this.messages.push({
            role: "tool",
            tool_call_id: call.id,
            content: JSON.stringify(toolResult),
          });
        }

        continue;
      }

      const clean = sanitizeOutput(content) || FALLBACK_RESPONSE();
      this.messages.push({ role: "assistant", content: clean });
      sink.assistantEnd?.(clean, meta);
      return;
    }

    sink.info?.(t("agent.turnLimit", { max: MAX_TURNS }));
  }

  async generateTitle() {
    const history = this.messages
      .slice(1)
      .filter(
        (message) =>
          (message.role === "user" || message.role === "assistant") &&
          typeof message.content === "string" &&
          message.content.trim(),
      )
      .slice(0, 6);

    if (history.length === 0) return "";

    const response = await this.client.chat.completions.create({
      model: this.modelId,
      temperature: 0.3,
      messages: [
        {
          role: "system",
          content:
            "Give the following conversation a short, descriptive title of 2-4 words. Write only the title; do not use quotes, periods, or extra explanation.",
        },
        ...history,
        { role: "user", content: "Title for this conversation:" },
      ],
    });

    const raw = response.choices?.[0]?.message?.content ?? "";
    return raw
      .trim()
      .split("\n")[0]
      .replace(/^["'“”]+|["'“”]+$/g, "")
      .trim()
      .slice(0, 40);
  }

  async compact() {
    const history = this.messages
      .slice(1)
      .filter(
        (message) =>
          (message.role === "user" || message.role === "assistant") &&
          typeof message.content === "string" &&
          message.content.trim(),
      );

    if (history.length === 0) return { summary: "", tokens: 0 };

    const response = await this.client.chat.completions.create({
      model: this.modelId,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "Summarize the following conversation history concisely, preserving all information useful for next steps (file paths, decisions made, changes applied, open tasks, user preferences). Write only the summary.",
        },
        ...history,
        { role: "user", content: "Now summarize this conversation." },
      ],
    });

    const summary = response.choices?.[0]?.message?.content?.trim() ?? "";
    if (!summary) return { summary: "", tokens: 0 };

    this.messages = [
      { role: "system", content: getSystemPrompt() },
      { role: "user", content: `[SUMMARY] Summary of the previous conversation:\n${summary}` },
      { role: "assistant", content: "I've got the summary. We can continue where we left off." },
    ];

    const tokens = Math.ceil(
      this.messages.reduce((sum, message) => sum + String(message.content ?? "").length, 0) / 4,
    );

    return { summary, tokens };
  }

  #reportError(error, sink) {
    if (isCancelled()) {
      sink.info?.(t("agent.cancelled"));
    } else if (error instanceof OpenAI.AuthenticationError) {
      sink.error?.(t("agent.authError"));
      sink.info?.(t("agent.authHint"));
    } else if (error instanceof OpenAI.RateLimitError) {
      sink.error?.(t("agent.rateLimit"));
    } else if (error instanceof OpenAI.APIConnectionError) {
      sink.error?.(t("agent.connection", { url: API_BASE_URL }));
    } else if (error instanceof OpenAI.APIError) {
      sink.error?.(t("agent.apiError", { status: error.status ?? "?", message: error.message }));
    } else {
      sink.error?.(t("agent.unknownError", { message: error.message }));
    }
  }
}
