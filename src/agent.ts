import path from "node:path";
import OpenAI from "openai";
import { API_BASE_URL, DEFAULT_MODEL_ID, getModelInfo } from "./config.js";
import { TOOLS_SCHEMA, executeTool } from "./tools.js";
import type { ToolArgs } from "./tools.js";
import { sanitizeOutput, errorProp } from "./utils.js";
import { t } from "./i18n/index.js";
import { loadGrants, addGrant } from "./permissions.js";
import { isUnsafeWorkspace } from "./workspace.js";
import type { ChatMessage, TranscriptMeta } from "./session.js";
import type { Sink } from "./sink.js";
import {
  isCancelled,
  resetCancel,
  setAbortHandler,
  clearAbortHandler,
} from "./cancel.js";

const MAX_TURNS = 100;
const RENDER_INTERVAL_MS = 50;
const FALLBACK_RESPONSE = (): string => t("agent.fallback");

// Sunucudan bu süre boyunca hiç veri gelmezse istek iptal edilir (WENOX_REQUEST_TIMEOUT_MS ile ayarlanır).
const REQUEST_TIMEOUT_MS = Number(process.env.WENOX_REQUEST_TIMEOUT_MS) || 120_000;

// Sohbet mesajları SDK'nın dar birleşimine değil, kendi yapımıza göre tutuluyor:
// oturum dosyasından doğrulanmadan okunuyorlar ve alanları elle kuruluyor.
// SDK sınırında tek bir daraltma yapılıyor (bkz. #sdkMessages).
type SdkMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;

export class RequestTimeoutError extends Error {
  constructor() {
    super("Request timed out");
    this.name = "RequestTimeoutError";
  }
}

const PATH_TOOLS = new Set(["read_file", "write_file", "edit_file", "list_dir", "search_code"]);
const DENIED_EXTERNAL = "User denied access to a path outside the project directory.";
const PLAN_BLOCKED_TOOLS = new Set(["write_file", "edit_file", "run_command", "change_directory"]);
const PLAN_BLOCKED_ERROR =
  "Blocked: the agent is in PLAN mode (read-only). Switch to Build mode (Tab) to modify files or run commands.";

interface ToolCallAccumulator {
  id: string;
  name: string;
  arguments: string;
}

interface StreamResult {
  content: string;
  toolCalls: ToolCallAccumulator[];
  meta: TranscriptMeta;
}

function withinProject(targetPath: unknown, root: string): boolean {
  const abs = path.resolve(root, String(targetPath));
  const rel = path.relative(root, abs);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

export function getSystemPrompt(mode = "build"): string {
  const cwd = process.cwd();
  const modeLine =
    mode === "plan"
      ? "MODE: PLAN (read-only). Do NOT modify files and do NOT run commands — write_file, edit_file and run_command are disabled. Inspect the codebase and propose a clear, step-by-step plan. If the user asks you to make changes, describe exactly what you would change and tell them to press the Tab key to switch to Build mode, because only then can you apply the change."
      : "MODE: BUILD. You may inspect the codebase, modify files and run commands to complete the task. Pressing the Tab key switches to Plan mode (read-only).";
  const workspaceNote = isUnsafeWorkspace(cwd)
    ? "\nWARNING: The working directory does not look like a project directory (it is a user or system location). Be extra careful here: never delete or overwrite anything unless the user explicitly asks, prefer read-only inspection, and suggest that the user switch to a project folder.\n"
    : "";
  return `You are WenOX AI. You are an advanced AI Coding Assistant developed by WenOX.
If asked who you are, your answer is always: "I am WenOX AI, developed by WenOX." Never state any other name.
You have direct access to the local file system and can use the tools below to inspect projects, read files, edit files, and run commands.

${modeLine}
${workspaceNote}
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
7. \`code_intel\`: Queries a language server for definition / references / hover / document symbols.
8. \`ask_user\`: Asks the user a multiple-choice question (when a genuine preference is needed).

Your Working Principles:
- BE ACTION-ORIENTED: Never say things like "I will inspect with this command: ..." and dump command text. If you want to list files, search, or run a command, CALL YOUR TOOL DIRECTLY instead of writing it out as text.
- NEVER enter infinite loops repeating the same file extensions, command parameters, or words.
- When the user says "look at the build files", "check the build log", "read the error", immediately inspect the relevant build files such as \`build.log\` or \`.sln\` in the project directly with \`read_file\` or \`list_dir\`.
- Use file paths appropriate to the operating system; do NOT use Linux-specific \`/tmp/...\` paths on Windows.
- When you want to create a new file, NEVER run \`echo ... > file\` in the terminal; use the \`write_file\` tool directly.
- Do not ramble; focus directly on the result, be clear and professional.
- Do NOT NAG the user with unnecessary questions. If something is unclear, proceed with a reasonable assumption and state it. However, if a genuine preference/decision is needed (e.g. two different directions, which file/technology, style), use \`ask_user\` to ask a short question with 2-4 options; do not guess and go down the wrong path without asking.
- The CLI you run inside is a Node process (pid ${process.pid}). NEVER run commands that kill every Node process (\`taskkill /IM node.exe\`, \`pkill node\`, \`killall node\`, \`Get-Process node | Stop-Process\`) or that kill pid ${process.pid} — that would terminate you. Kill only the exact PID/process you identified, by name and port.
- Always respond in the same language the user writes in.
- Always write characters correctly in UTF-8, never produce garbled characters (including Turkish characters such as ı, İ, ş, ğ, ü, ö, ç when replying in Turkish).`;
}

function parseToolArgs(raw: unknown): ToolArgs {
  if (!raw) return {};
  try {
    return JSON.parse(String(raw)) as ToolArgs;
  } catch {
    return {};
  }
}

export class WenOXAgent {
  apiKey: string;
  modelId: string;
  autoApprove: boolean;
  clientInstance: OpenAI | null;
  mode: string;
  messages: ChatMessage[];
  projectRoot: string;
  unsafeRoot: boolean;
  allowedExternal: Set<string>;
  // Kasıtlı olarak başlatılmıyor: `undefined`, "stream_options destekleniyor
  // varsay" demek. Yalnızca 400 alındığında false'a çekiliyor.
  supportsUsage?: boolean;

  constructor({
    apiKey,
    modelId = DEFAULT_MODEL_ID,
    autoApprove = false,
  }: {
    apiKey?: string;
    modelId?: string;
    autoApprove?: boolean;
  }) {
    this.apiKey = apiKey ?? "";
    this.modelId = modelId;
    this.autoApprove = autoApprove;
    this.clientInstance = null;
    this.mode = "build";
    this.messages = [{ role: "system", content: getSystemPrompt(this.mode) }];
    this.projectRoot = process.cwd();
    this.unsafeRoot = isUnsafeWorkspace(this.projectRoot);
    this.allowedExternal = new Set(loadGrants(this.projectRoot));
  }

  // OpenAI istemcisi tembel kurulur: anahtar onboarding ekranında alınacağı için
  // başlangıçta boş olabilir ve SDK boş anahtarla kurulmaya izin vermez.
  get client(): OpenAI {
    if (!this.clientInstance) {
      this.clientInstance = new OpenAI({ apiKey: this.apiKey, baseURL: API_BASE_URL });
    }
    return this.clientInstance;
  }

  set client(value: OpenAI) {
    this.clientInstance = value;
  }

  #sdkMessages(): SdkMessage[] {
    return this.messages as unknown as SdkMessage[];
  }

  setModel(modelId: string): void {
    this.modelId = modelId;
  }

  setMode(mode: string): string {
    const next = mode === "plan" ? "plan" : "build";
    if (this.mode !== next) {
      this.mode = next;
      this.#refreshSystem();
    }
    return this.mode;
  }

  #refreshSystem(): void {
    if (this.messages[0]?.role === "system") {
      this.messages[0] = { role: "system", content: getSystemPrompt(this.mode) };
    }
  }

  setApiKey(apiKey: string): void {
    this.apiKey = apiKey;
    this.clientInstance = null;
  }

  clearHistory(): void {
    this.messages = [{ role: "system", content: getSystemPrompt(this.mode) }];
  }

  updateCwd(): void {
    this.#refreshSystem();
    this.projectRoot = process.cwd();
    this.unsafeRoot = isUnsafeWorkspace(this.projectRoot);
    this.allowedExternal = new Set(loadGrants(this.projectRoot));
  }

  get messageCount(): number {
    return Math.max(0, this.messages.length - 1);
  }

  #isExternalAllowed(abs: string): boolean {
    for (const root of this.allowedExternal) {
      if (abs === root || abs.startsWith(root + path.sep)) return true;
    }
    return false;
  }

  async #ensurePathAccess(
    toolName: string,
    args: ToolArgs | null | undefined,
    sink: Sink,
  ): Promise<boolean> {
    if (!PATH_TOOLS.has(toolName)) return true;
    const targetPath = args?.path ?? ".";
    const root = this.projectRoot;
    // Güvenli olmayan bir kökte (ev dizini, sürücü kökü…) hiçbir yol güvenilir
    // sayılmaz: list_dir gibi araçlar bile izin ister.
    if (!this.unsafeRoot && withinProject(targetPath, root)) return true;

    const abs = path.resolve(root, String(targetPath));
    if (this.#isExternalAllowed(abs)) return true;

    const isDirTool = toolName === "list_dir" || toolName === "search_code";
    const grant = isDirTool ? abs : path.dirname(abs);
    const pattern = `${grant}${path.sep}*`;

    const decision = sink.askPermission
      ? await sink.askPermission({
          tool: toolName,
          path: args?.path,
          resolved: abs,
          grant,
          pattern,
        })
      : "reject";

    if (decision === "always") {
      this.allowedExternal.add(grant);
      addGrant(this.projectRoot, grant);
      return true;
    }
    return decision === "once";
  }

  async #streamCompletion(sink: Sink, modelName: string): Promise<StreamResult> {
    sink.thinking?.(t("agent.thinking", { model: modelName }));

    const params: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming = {
      model: this.modelId,
      messages: this.#sdkMessages(),
      tools: TOOLS_SCHEMA,
      tool_choice: "auto",
      temperature: 0.3,
      stream: true,
    };

    const controller = new AbortController();
    const requestOptions = { signal: controller.signal };
    setAbortHandler(() => controller.abort());

    const startedAt = Date.now();
    let timedOut = false;
    let idleTimer: NodeJS.Timeout | null = null;
    const armIdle = (): void => {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        timedOut = true;
        try {
          controller.abort();
        } catch {
          // ignore
        }
      }, REQUEST_TIMEOUT_MS);
    };
    armIdle();

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
          if (
            errorProp(error, "status") === 400 ||
            /stream_options/i.test(String(errorProp(error, "message") ?? ""))
          ) {
            this.supportsUsage = false;
            stream = await this.client.chat.completions.create(params, requestOptions);
          } else {
            throw error;
          }
        }
      }

      let content = "";
      let usage: OpenAI.CompletionUsage | null = null;
      let firstTokenAt: number | null = null;
      const toolCalls: ToolCallAccumulator[] = [];
      let lastRender = 0;

      for await (const chunk of stream) {
        armIdle();

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

      if (timedOut) throw new RequestTimeoutError();

      const promptChars = this.messages.reduce(
        (sum, message) => sum + String(message.content ?? "").length,
        0,
      );
      const meta: TranscriptMeta = {
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
    } catch (error) {
      if (timedOut) throw new RequestTimeoutError();
      throw error;
    } finally {
      if (idleTimer) clearTimeout(idleTimer);
      clearAbortHandler();
    }
  }

  // compact/title gibi yardımcı istekler: iptal edilebilir + zaman aşımlı
  async #request(
    params: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming,
    timeoutMs = REQUEST_TIMEOUT_MS,
  ): Promise<OpenAI.Chat.Completions.ChatCompletion> {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      try {
        controller.abort();
      } catch {
        // ignore
      }
    }, timeoutMs);
    setAbortHandler(() => controller.abort());
    try {
      return await this.client.chat.completions.create(params, {
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
      clearAbortHandler();
    }
  }

  async chatStep(userPrompt: string, sink: Sink = {}): Promise<void> {
    resetCancel();
    this.messages.push({ role: "user", content: userPrompt });

    for (let turn = 0; turn < MAX_TURNS; turn += 1) {
      if (isCancelled()) {
        sink.assistantClear?.();
        sink.info?.(t("agent.cancelled"));
        return;
      }

      const modelInfo = getModelInfo(this.modelId);
      let result: StreamResult;
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

          let toolResult;
          if (this.mode === "plan" && PLAN_BLOCKED_TOOLS.has(call.name)) {
            toolResult = { success: false, error: PLAN_BLOCKED_ERROR };
          } else {
            let allowed = true;
            try {
              allowed = await this.#ensurePathAccess(call.name, args, sink);
            } catch {
              allowed = false;
            }

            if (!allowed) {
              toolResult = { success: false, error: DENIED_EXTERNAL };
            } else {
              try {
                if (call.name === "ask_user") {
                  const options = Array.isArray(args.options) ? args.options : [];
                  const response = sink.askUser
                    ? await sink.askUser({ question: String(args.question ?? ""), options })
                    : { answer: t("ask.noInterface") };
                  toolResult = {
                    success: !response.cancelled,
                    question: String(args.question ?? ""),
                    answer: response.answer,
                  };
                } else if (call.name === "run_command" && !this.autoApprove) {
                  const approved = sink.askApproval
                    ? await sink.askApproval(String(args.command ?? ""))
                    : false;
                  toolResult = approved
                    ? await executeTool("run_command", args)
                    : { success: false, error: "User rejected running this command." };
                } else {
                  toolResult = await executeTool(call.name, args);
                }
              } catch (error) {
                toolResult = { success: false, error: String(errorProp(error, "message")) };
              }
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

  async generateTitle(): Promise<string> {
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

    const response = await this.#request({
      model: this.modelId,
      temperature: 0.3,
      messages: [
        {
          role: "system",
          content:
            "Give the following conversation a short, descriptive title of 2-4 words. Write only the title; do not use quotes, periods, or extra explanation.",
        },
        ...(history as unknown as SdkMessage[]),
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

  async compact(): Promise<{ summary: string; tokens: number }> {
    const history = this.messages
      .slice(1)
      .filter(
        (message) =>
          (message.role === "user" || message.role === "assistant") &&
          typeof message.content === "string" &&
          message.content.trim(),
      );

    if (history.length === 0) return { summary: "", tokens: 0 };

    const response = await this.#request({
      model: this.modelId,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "Summarize the following conversation history concisely, preserving all information useful for next steps (file paths, decisions made, changes applied, open tasks, user preferences). Write only the summary.",
        },
        ...(history as unknown as SdkMessage[]),
        { role: "user", content: "Now summarize this conversation." },
      ],
    });

    const summary = response.choices?.[0]?.message?.content?.trim() ?? "";
    if (!summary) return { summary: "", tokens: 0 };

    this.messages = [
      { role: "system", content: getSystemPrompt(this.mode) },
      {
        role: "user",
        content: `[SUMMARY] Summary of the previous conversation:\n${summary}`,
      },
      {
        role: "assistant",
        content: "I've got the summary. We can continue where we left off.",
      },
    ];

    const tokens = Math.ceil(
      this.messages.reduce(
        (sum, message) => sum + String(message.content ?? "").length,
        0,
      ) / 4,
    );

    return { summary, tokens };
  }

  #reportError(error: unknown, sink: Sink): void {
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
      sink.error?.(
        t("agent.apiError", { status: error.status ?? "?", message: error.message }),
      );
    } else if (error instanceof RequestTimeoutError) {
      sink.error?.(t("agent.timeout", { seconds: Math.round(REQUEST_TIMEOUT_MS / 1000) }));
    } else {
      sink.error?.(t("agent.unknownError", { message: String(errorProp(error, "message")) }));
    }
  }
}
