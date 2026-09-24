import path from "node:path";
import OpenAI from "openai";
import { API_BASE_URL, DEFAULT_MODEL_ID, getModelInfo, loadConfig } from "./config.js";
import { TOOLS_SCHEMA, executeTool } from "./tools.js";
import type { ToolArgs, ToolResult } from "./tools.js";
import { sanitizeOutput, errorProp } from "./utils.js";
import { messagesTokenCount, tokenCount } from "./tokens.js";
import { t } from "./i18n/index.js";
import { debugLog } from "./debug.js";
import { loadGrants, addGrant } from "./permissions.js";
import { evaluateRules, isSecretFile, permissionTarget } from "./permission-rules.js";
import { isUnsafeWorkspace } from "./workspace.js";
import { loadInstructions } from "./instructions.js";
import { callResultText, connectAll, parseToolName, toolSchemas } from "./mcp.js";
import type { McpConnection } from "./mcp.js";
import { fetchWithSession } from "./session.js";
import type { ChatMessage, TodoItem, TranscriptMeta } from "./session.js";
import { contentParts } from "./images.js";
import type { Attachment } from "./images.js";
import type { Sink } from "./sink.js";
import {
  CancelledError,
  isCancelled,
  raceWithCancel,
  resetCancel,
  setAbortHandler,
  clearAbortHandler,
} from "./cancel.js";

const MAX_TURNS = 100;
// Çıktı sınırına takılan yanıt kaç kez otomatik sürdürülür (sonsuz döngü olmasın).
const MAX_TRUNCATED_CONTINUES = 3;
// Kesilen araç çağrısı ASLA çalıştırılmaz: argümanları yarımdır ve bozuk bir
// dosya yazardı. Modele bunun yerine işi bölmesi söylenir.
const TRUNCATED_CALL_ERROR =
  "This tool call was cut off by the output length limit: its arguments were incomplete, so it was NOT executed. Do the same work in smaller pieces — one tool call per response. For a long file, write a short first section with write_file, then append the rest with edit_file calls.";
const TRUNCATED_REPLY_PROMPT =
  "Your previous response was cut off by the output length limit before it finished. Continue from exactly where it stopped, without repeating what you already wrote, and keep this continuation short.";
// Akış sırasında arayüze gönderilen güncelleme aralığı: 50 ms'de saniyede 20
// yeniden çizim oluyordu ve uzun sohbetlerde arayüz CPU'ya boğuluyordu.
const RENDER_INTERVAL_MS = 80;
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

const PATH_TOOLS = new Set(["read_file", "write_file", "edit_file", "list_dir", "search_code", "glob"]);
const DENIED_EXTERNAL = "User denied access to a path outside the project directory.";
const PLAN_BLOCKED_TOOLS = new Set(["write_file", "edit_file", "run_command", "change_directory"]);
const PLAN_BLOCKED_ERROR =
  "You are in PLAN mode (read-only), so this tool is not available. Do not retry it. Describe the change you would make and tell the user to press Tab to switch to Build mode.";
// Mod değişimi sistem prompt'una taze bir bildirim olarak eklenir: geçmişte
// kalan "plan modundasın" / "yazma engellendi" mesajları modeli yanıltıyordu,
// Build moduna geçildiğinde bile yazmayı reddediyordu.
const MODE_NOTES: Record<string, string> = {
  build:
    "[System notice] The mode has just switched to BUILD. Writing/editing files, running commands and MCP tools are ENABLED — they are present in your tool list again. Any earlier message in this conversation that says you are in PLAN mode, or that a write was blocked, is OUTDATED: never repeat it, and never ask the user to press Tab again. Do the work now.",
  plan:
    "[System notice] The mode has just switched to PLAN (read-only). write_file, edit_file, run_command and MCP tools are NOT in your tool list anymore. Inspect the codebase and propose a plan; if the user wants changes applied, tell them to press Tab to switch to Build mode.",
};
// Mod hatırlatıcısı: her kullanıcı mesajının ve her araç sonucunun sonuna
// eklenir. Prompt'un başındaki MODE satırı yetmiyordu: zayıf modeller modu
// geçmişteki kendi eski cümlelerinden okuyup Build modunda bile "hâlâ plan
// modundayım" diyerek yazmayı reddediyordu. Kısa tutuluyor çünkü geçmişteki her
// mesajda tekrar ediyor.
const MODE_REMINDERS: Record<string, string> = {
  build:
    "[mode: BUILD — writing files and running commands is ENABLED right now. Do not claim PLAN mode and do not ask the user to press Tab; any earlier message saying otherwise is outdated.]",
  plan: "[mode: PLAN (read-only) — no writes in this mode; inspect the code and propose a plan.]",
};

interface ToolCallAccumulator {
  id: string;
  name: string;
  arguments: string;
}

// Akış parçasının kullandığımız alanları (SDK tipi çok geniş).
interface StreamDelta {
  content?: string | null;
  reasoning_content?: unknown;
  tool_calls?: {
    index?: number;
    id?: string;
    function?: { name?: string; arguments?: string };
  }[];
}

interface StreamResult {
  content: string;
  toolCalls: ToolCallAccumulator[];
  meta: TranscriptMeta;
  // Sağlayıcının bitiş nedeni: "length" ise çıktı token sınırına takıldı.
  finishReason?: string;
}

function withinProject(targetPath: unknown, root: string): boolean {
  const abs = path.resolve(root, String(targetPath));
  const rel = path.relative(root, abs);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

// ÖNEK ÖNBELLEĞİ KURALI: isteklerin başı (sistem prompt'u + araç şemaları +
// geçmiş) oturum boyunca bayt bayt aynı kalmalı. Sağlayıcı önbelleği yalnızca
// ortak önek üzerinden çalışır; buraya tarih/saat/rastgele veri ya da her
// istekte değişen bir şey eklersen önbellek tamamen kaçar. Mod değişimi
// (Tab) bilerek istisnadır: sistem prompt'u ve araç listesi değişir.
export function getSystemPrompt(mode = "build"): string {
  const cwd = process.cwd();
  const modeLine =
    mode === "plan"
      ? "MODE: PLAN (read-only). write_file, edit_file, run_command and MCP tools are NOT available in this mode — they are not even in your tool list, so never call them. Inspect the codebase and propose a clear, step-by-step plan. If the user asks you to make changes, describe exactly what you would change and tell them to press the Tab key to switch to Build mode, because only then can you apply the change."
      : "MODE: BUILD. You may inspect the codebase, modify files and run commands to complete the task. Pressing the Tab key switches to Plan mode (read-only).";
  // Mod oyunu: geçmişteki eski mod mesajları geçersiz. Model yazma aracını
  // görebiliyorsa yazma izni de vardır.
  const modeAuthority = `
Mode is not negotiable and never comes from the conversation history:
- The MODE line above is the CURRENT mode and always overrides anything said earlier in this chat.
- If an earlier message says you are in PLAN mode, or shows a write/command being blocked, that is stale — the user may have switched modes since. Never claim you are in PLAN mode, and never tell the user to press Tab, on the basis of old messages.
- Instead of trusting history, look at your tool list right now: if write_file and edit_file are present, you are in BUILD mode and you must write the files.
`;
  const workspaceNote = isUnsafeWorkspace(cwd)
    ? "\nWARNING: The working directory does not look like a project directory (it is a user or system location). Be extra careful here: never delete or overwrite anything unless the user explicitly asks, prefer read-only inspection, and suggest that the user switch to a project folder.\n"
    : "";
  // Projedeki AGENTS.md/CLAUDE.md talimatları prompt'a eklenir (varsa).
  const projectRules = loadInstructions(cwd);
  const instructions = projectRules
    ? `\nProject instructions (from AGENTS.md/CLAUDE.md — follow them):\n${projectRules}\n`
    : "";
  return `You are WenOX AI. You are an advanced AI Coding Assistant developed by WenOX.
If asked who you are, your answer is always: "I am WenOX AI, developed by WenOX." Never state any other name.
You have direct access to the local file system and can use the tools below to inspect projects, read files, edit files, and run commands.

${modeLine}
${modeAuthority}
${workspaceNote}
${instructions}Environment:
- Operating System: ${process.platform === "win32" ? "Windows" : process.platform}
- Working / Project Directory: ${cwd}

Your Available Tools:
1. \`read_file\`: Reads a file's contents with line numbers. You MUST use this to inspect or edit a file.
2. \`write_file\`: Creates a new file or overwrites an existing file.
3. \`edit_file\`: Safely replaces a specific code block (target) in a file with a new one (replacement).
4. \`list_dir\`: Lists files and folders in the project.
5. \`search_code\`: Searches file contents for a keyword or regex.
6. \`glob\`: Finds files by pattern (e.g. \`**/*.tsx\`), newest first.
7. \`run_command\`: Runs a shell command in the terminal.
8. \`code_intel\`: Queries a language server for definition / references / hover / document symbols.
9. \`webfetch\`: Downloads a URL and returns its text (docs, changelogs).
10. \`ask_user\`: Asks the user a multiple-choice question (when a genuine preference is needed).
11. \`todo_write\`: Task list for long multi-step work (project-scale). Skip it for small requests.

Your Working Principles:
- BE ACTION-ORIENTED: Never say things like "I will inspect with this command: ..." and dump command text. If you want to list files, search, or run a command, CALL YOUR TOOL DIRECTLY instead of writing it out as text.
- WORK INCREMENTALLY, ONE STEP PER RESPONSE: emit a SINGLE tool call, then stop. Its result is sent back to you automatically and you continue in the next request. NEVER bundle several file writes, or a write plus unrelated tool calls, into one response. Every tool call must be followed by another request before you consider the task done.
- A SINGLE \`write_file\` CALL MUST NEVER CONTAIN A WHOLE LARGE FILE. Build large files piece by piece: create the file with \`write_file\` holding only the first section (roughly under 150 lines), then extend it with \`edit_file\` calls, one section at a time. To append, use the file's current last line as \`target\` and pass that same line followed by the new section as \`replacement\`.
- Your output length is limited: one gigantic response gets truncated mid-file and the work is lost. Many small steps are faster and safer than one huge block. If you notice you are about to emit a very long body, split it into multiple calls instead.
- Never paste file contents or long code blocks into your reply text; put the content in the tool call itself.
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

// Model görev listesini serbest biçimde gönderiyor; alanlar burada doğrulanıp
// sadeleştiriliyor (boş/aşırı uzun girdiler atılır).
const MAX_TODOS = 50;
const MAX_TODO_LENGTH = 200;

function normalizeTodos(raw: unknown): TodoItem[] {
  if (!Array.isArray(raw)) return [];
  const todos: TodoItem[] = [];
  for (const entry of raw) {
    const item = entry as { content?: unknown; status?: unknown } | null;
    const content = String(item?.content ?? "").trim().slice(0, MAX_TODO_LENGTH);
    if (!content) continue;
    const status =
      item?.status === "in_progress" || item?.status === "completed" ? item.status : "pending";
    todos.push({ content, status });
    if (todos.length >= MAX_TODOS) break;
  }
  return todos;
}

function parseToolArgs(raw: unknown): ToolArgs {
  if (!raw) return {};
  try {
    return JSON.parse(String(raw)) as ToolArgs;
  } catch {
    return {};
  }
}

// Çıktı sınırına takılan araç çağrısının argümanları yarıda kesilir; argümansız
// araçlarda ise boş string gelir (bu geçerli). Yalnızca yarım JSON sorun sayılır.
function argsIncomplete(raw: unknown): boolean {
  const value = String(raw ?? "").trim();
  if (!value) return false;
  try {
    JSON.parse(value);
    return false;
  } catch {
    return true;
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
  // Modelin tuttuğu görev listesi; oturumla birlikte saklanıyor.
  todos: TodoItem[] = [];
  // Aynı araç+argümanın üst üste kaç kez çağrıldığı (döngü koruması).
  repeatSignature = "";
  repeatCount = 0;
  // Çıktı sınırında kesilen yanıt kaç kez sürdürüldü (sonsuz sürdürmeye karşı).
  truncatedContinues = 0;
  // Mod değişiminde sistem prompt'una eklenen bildirim (geçmişi geçersiz kılar).
  modeNote = "";
  // Bağlı MCP sunucuları ve araçları.
  mcpConnections: McpConnection[] = [];
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
      this.clientInstance = new OpenAI({
        apiKey: this.apiKey,
        baseURL: API_BASE_URL,
        fetch: fetchWithSession(globalThis.fetch),
      });
    }
    return this.clientInstance;
  }

  set client(value: OpenAI) {
    this.clientInstance = value;
  }

  // Mod hatırlatıcısı istek anında, HER kullanıcı mesajının ve HER araç
  // sonucunun sonuna eklenir; depolanan geçmişe dokunulmaz. Ekleme
  // deterministiktir: aynı modda aynı mesaj dizisi her istekte aynı metni
  // üretir, bu yüzden önek önbelleği korunur. Yalnızca SON mesaja eklemek
  // önbelleği bozuyordu — sonraki istekte "son" değiştiği için bir önceki mesaj
  // hatırlatıcısız hâline dönüp önek kayıyordu (her turda önbellek kaybı).
  #sdkMessages(): SdkMessage[] {
    const reminder = MODE_REMINDERS[this.mode] ?? "";
    if (!reminder) return this.messages as unknown as SdkMessage[];
    return this.messages.map((message) => {
      if (message.role !== "user" && message.role !== "tool") return message;
      const content = Array.isArray(message.content)
        ? [...message.content, { type: "text" as const, text: reminder }]
        : `${typeof message.content === "string" ? message.content : ""}\n\n${reminder}`;
      return { ...message, content };
    }) as unknown as SdkMessage[];
  }

  // Plan modunda yazılan "engellendi" kayıtları Build moduna geçince bayatlar:
  // model bunları sistemin kesin bilgisi sayıp yazmayı reddediyordu.
  #defusePlanBlocks(): void {
    for (const message of this.messages) {
      if (message.role !== "tool") continue;
      const text = typeof message.content === "string" ? message.content : "";
      if (!text.includes("PLAN mode")) continue;
      message.content = JSON.stringify({
        success: false,
        error:
          "This call was blocked earlier, while the agent was in PLAN mode. The mode is now BUILD: writing is enabled, so call the tool again and apply the change.",
      });
    }
  }

  // Plan modunda yazma/komut araçları şemadan tamamen çıkarılır: model onları
  // hiç görmediği için denemez, "engellendi" gürültüsü de oluşmaz. Çalışma
  // anındaki plan kontrolü eski oturumlardan gelen çağrılara karşı duruyor.
  #activeToolSchemas(): typeof TOOLS_SCHEMA {
    if (this.mode !== "plan") {
      return [...TOOLS_SCHEMA, ...toolSchemas(this.mcpConnections)] as typeof TOOLS_SCHEMA;
    }
    return TOOLS_SCHEMA.filter(
      (tool) => !PLAN_BLOCKED_TOOLS.has(tool.function.name),
    ) as typeof TOOLS_SCHEMA;
  }

  setModel(modelId: string): void {
    this.modelId = modelId;
  }

  setMode(mode: string): string {
    const next = mode === "plan" ? "plan" : "build";
    if (this.mode !== next) {
      this.mode = next;
      // Açılışta (henüz konuşma yokken) not eklenmez; asıl sorun modun ortada
      // değişip geçmişin eski modu haykırması.
      if (this.messages.length > 1) this.modeNote = MODE_NOTES[next] ?? "";
      if (next === "build") this.#defusePlanBlocks();
      this.#refreshSystem();
    }
    return this.mode;
  }

  // Sistem prompt'u + varsa mod değişimi bildirimi.
  #systemContent(): string {
    const base = getSystemPrompt(this.mode);
    return this.modeNote ? `${base}\n${this.modeNote}\n` : base;
  }

  #refreshSystem(): void {
    if (this.messages[0]?.role === "system") {
      this.messages[0] = { role: "system", content: this.#systemContent() };
    }
  }

  setApiKey(apiKey: string): void {
    this.apiKey = apiKey;
    this.clientInstance = null;
  }

  // MCP sunucularına bağlanır; bağlanamayanların hatası çağırana döner.
  async loadMcp(): Promise<string[]> {
    const { connections, errors } = await connectAll();
    this.mcpConnections = connections;
    return errors;
  }

  closeMcp(): void {
    for (const connection of this.mcpConnections) connection.close();
    this.mcpConnections = [];
  }

  clearHistory(): void {
    this.messages = [{ role: "system", content: getSystemPrompt(this.mode) }];
    this.todos = [];
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

  // Kural kaynaklı izin sorusu (.env ya da "ask" kalıbı): aynı panel kullanılır.
  async #askPermission(
    toolName: string,
    args: ToolArgs | null | undefined,
    sink: Sink,
  ): Promise<boolean> {
    const targetPath = String(args?.path ?? args?.command ?? "");
    const abs = targetPath ? path.resolve(this.projectRoot, targetPath) : this.projectRoot;
    const isDirTool = toolName === "list_dir" || toolName === "search_code";
    const grant = isDirTool ? abs : path.dirname(abs);

    const decision = sink.askPermission
      ? await sink.askPermission({
          tool: toolName,
          path: args?.path,
          resolved: abs,
          grant,
          pattern: `${grant}${path.sep}*`,
        })
      : "reject";

    if (decision === "always") {
      this.allowedExternal.add(grant);
      addGrant(this.projectRoot, grant);
      return true;
    }
    return decision === "once";
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
      tools: this.#activeToolSchemas(),
      tool_choice: "auto",
      temperature: 0.3,
      stream: true,
    };

    const controller = new AbortController();
    const requestOptions = { signal: controller.signal };
    setAbortHandler(() => controller.abort());

    debugLog("istek gönderiliyor");
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
        stream = await raceWithCancel(this.client.chat.completions.create(params, requestOptions));
      } else {
        try {
          stream = await raceWithCancel(
            this.client.chat.completions.create(
              { ...params, stream_options: { include_usage: true } },
              requestOptions,
            ),
          );
        } catch (error) {
          if (
            errorProp(error, "status") === 400 ||
            /stream_options/i.test(String(errorProp(error, "message") ?? ""))
          ) {
            this.supportsUsage = false;
            stream = await raceWithCancel(
              this.client.chat.completions.create(params, requestOptions),
            );
          } else {
            throw error;
          }
        }
      }

      let content = "";
      let reasoning = "";
      let finishReason = "";
      let usage: OpenAI.CompletionUsage | null = null;
      let firstTokenAt: number | null = null;
      let firstVisibleAt: number | null = null;
      const toolCalls: ToolCallAccumulator[] = [];
      let lastRender = 0;
      let rawText = "";

      // Akış adım adım okunuyor: her bekleme iptalle yarışıyor, böylece sağlayıcı
      // abort'a tepki vermese bile tur takılı kalmıyor.
      const iterator = (stream as AsyncIterable<unknown>)[Symbol.asyncIterator]();
      for (;;) {
        const step = await raceWithCancel(iterator.next() as Promise<IteratorResult<unknown>>);
        if (step.done) break;
        const chunk = step.value as {
          usage?: OpenAI.CompletionUsage;
          choices?: { delta?: StreamDelta; finish_reason?: string | null }[];
        };
        armIdle();

        if (chunk.usage) usage = chunk.usage;
        if (chunk.choices?.[0]?.finish_reason) finishReason = chunk.choices[0].finish_reason;

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

        // Düşünme ayrı alanda gelir (`reasoning_content`), cevap `content`'te
        // kalır; ikisi de kendi akışında parça parça okunur.
        const thought = delta.reasoning_content;
        const reasoningDelta = typeof thought === "string" ? thought : "";
        const textDelta = typeof delta.content === "string" ? delta.content : "";

        if (reasoningDelta) reasoning += reasoningDelta;
        if (textDelta) {
          content += textDelta;
          // Düşünme bitip ilk görünür metin geldiği an: süresi buradan ölçülüyor.
          if (!firstVisibleAt) firstVisibleAt = Date.now();
        }

        if (reasoningDelta || textDelta) {
          if (!firstTokenAt) firstTokenAt = Date.now();
          rawText += reasoningDelta + textDelta;
          const now = Date.now();
          if (now - lastRender >= RENDER_INTERVAL_MS) {
            lastRender = now;
            sink.assistantUpdate?.(content, reasoning || undefined);
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
      debugLog("akış bitti");
      if (timedOut) throw new RequestTimeoutError();

      // Bağlam boyutu: API usage verdiyse o, yoksa gerçek tokenizer ile tahmin.
      const promptTokens = messagesTokenCount(this.messages);
      const meta: TranscriptMeta = {
        durationMs: Date.now() - startedAt,
        thinkingMs: firstTokenAt ? firstTokenAt - startedAt : undefined,
        thinkingDurationMs:
          firstTokenAt && firstVisibleAt ? firstVisibleAt - firstTokenAt : undefined,
        modelName,
        reasoning: reasoning || undefined,
        usage:
          usage ??
          {
            prompt_tokens: promptTokens,
            // Ham akış uzunluğu sayılır: düşünme de token harcıyor.
            completion_tokens: tokenCount(rawText),
            total_tokens: promptTokens + tokenCount(rawText),
            estimated: true,
          },
      };

      return { content, toolCalls, meta, finishReason: finishReason || undefined };
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
      return await raceWithCancel(
        this.client.chat.completions.create(params, {
          signal: controller.signal,
        }),
      );
    } finally {
      clearTimeout(timer);
      clearAbortHandler();
    }
  }

  async chatStep(userPrompt: string, sink: Sink = {}, attachments: Attachment[] = []): Promise<void> {
    debugLog("chatStep başladı");
    resetCancel();
    this.repeatSignature = "";
    this.repeatCount = 0;
    this.truncatedContinues = 0;
    this.messages.push({
      role: "user",
      content: attachments.length > 0 ? contentParts(userPrompt, attachments) : userPrompt,
    });

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
        if (error instanceof CancelledError) {
          sink.info?.(t("agent.cancelled"));
          return;
        }
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

          // Aynı araç aynı argümanlarla üst üste üç kez çağrıldıysa döngü var
          // demektir: kullanıcıyı bilgilendirip duruyoruz.
          const signature = `${call.name}:${call.arguments}`;
          if (signature === this.repeatSignature) this.repeatCount += 1;
          else {
            this.repeatSignature = signature;
            this.repeatCount = 1;
          }
          if (this.repeatCount >= 3) {
            sink.info?.(t("agent.doomLoop", { tool: call.name }));
            return;
          }

          // Çıktı sınırında kesilen çağrı çalıştırılmaz: argümanları yarım
          // olduğu için bozuk bir dosya yazardı. Model işi bölmeye yönlendirilir.
          if (argsIncomplete(call.arguments)) {
            sink.toolCall?.(call.name, {});
            const truncatedResult: ToolResult = { success: false, error: TRUNCATED_CALL_ERROR };
            sink.toolResult?.(call.name, truncatedResult);
            this.messages.push({
              role: "tool",
              tool_call_id: call.id,
              content: JSON.stringify(truncatedResult),
            });
            continue;
          }

          sink.toolCall?.(call.name, args);

          const mcpCall = parseToolName(call.name);
          let toolResult;
          if (this.mode === "plan" && (PLAN_BLOCKED_TOOLS.has(call.name) || mcpCall)) {
            toolResult = { success: false, error: PLAN_BLOCKED_ERROR };
          } else if (mcpCall) {
            // MCP araçlarının ne yaptığı bilinmiyor: izin sorulur.
            const connection = this.mcpConnections.find((entry) => entry.name === mcpCall.server);
            const allowed = connection
              ? this.autoApprove || (await this.#askPermission(call.name, args, sink))
              : false;
            if (!connection) {
              toolResult = { success: false, error: `MCP server is not connected: ${mcpCall.server}` };
            } else if (!allowed) {
              toolResult = { success: false, error: DENIED_EXTERNAL };
            } else {
              try {
                const result = await connection.call(mcpCall.tool, args as Record<string, unknown>);
                toolResult = { success: true, message: callResultText(result) };
              } catch (error) {
                toolResult = { success: false, error: String(errorProp(error, "message") ?? "MCP call failed") };
              }
            }
          } else {
            const target = permissionTarget(call.name, args);
            const rule = evaluateRules(loadConfig().permissions, call.name, target);

            let allowed = true;
            let deniedByRule = false;
            try {
              if (rule === "deny") {
                deniedByRule = true;
              } else if (rule === "allow") {
                allowed = true;
              } else if (rule === "ask") {
                allowed = await this.#askPermission(call.name, args, sink);
              } else if (isSecretFile(target)) {
                // .env gibi sır dosyaları proje içinde olsa bile sorulur.
                allowed = await this.#askPermission(call.name, args, sink);
              } else {
                allowed = await this.#ensurePathAccess(call.name, args, sink);
              }
            } catch {
              allowed = false;
            }

            if (deniedByRule) {
              toolResult = {
                success: false,
                error: `Denied by your permission rules (${call.name}: ${target ?? ""}). The user configured this pattern as "deny"; do not retry it.`,
              };
            } else if (!allowed) {
              toolResult = { success: false, error: DENIED_EXTERNAL };
            } else {
              try {
                if (call.name === "todo_write") {
                  this.todos = normalizeTodos(args.todos);
                  sink.todo?.(this.todos);
                  const done = this.todos.filter((todo) => todo.status === "completed").length;
                  toolResult = {
                    success: true,
                    count: this.todos.length,
                    message: `${done}/${this.todos.length} completed`,
                  };
                } else if (call.name === "ask_user") {
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

      // Cevap çıktı sınırında kesildiyse turu bitirme: modele kaldığı yerden
      // devam ettiriyoruz, yoksa kullanıcı yarım bir cevap görür.
      if (result.finishReason === "length" && this.truncatedContinues < MAX_TRUNCATED_CONTINUES) {
        this.truncatedContinues += 1;
        this.messages.push({ role: "assistant", content });
        sink.assistantEnd?.(content, meta);
        this.messages.push({ role: "user", content: TRUNCATED_REPLY_PROMPT });
        sink.info?.(t("agent.truncated"));
        continue;
      }

      // Yalnızca düşünüp cevap vermeyen modelde uydurma cevap gösterme:
      // düşünme zaten kendi kartında duruyor.
      const clean =
        sanitizeOutput(content) || (meta.reasoning ? "" : FALLBACK_RESPONSE());
      this.messages.push({ role: "assistant", content: clean });
      sink.assistantEnd?.(clean, meta);
      return;
    }

    sink.info?.(t("agent.turnLimit", { max: MAX_TURNS }));
  }

  async generateTitle(): Promise<string> {
    if (this.messages.length <= 1) return "";

    // Önek önbelleği: istek, konuşmanın TAM önekini kullanır ve talimatı en sona
    // ekler. Ayrı bir sistem prompt'u + kırpılmış geçmiş kurmak önbelleği
    // tamamen kaçırırdı; böylece başlık isteği önceki turun önbelleğine oturur.
    const response = await this.#request({
      model: this.modelId,
      temperature: 0.3,
      messages: [
        ...this.#sdkMessages(),
        {
          role: "user",
          content:
            "Give this whole conversation a short, descriptive title of 2-4 words. Write only the title; do not use quotes, periods, or extra explanation.",
        },
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
    if (this.messages.length <= 1) return { summary: "", tokens: 0 };

    // Önek önbelleği: sıkıştırma isteği de konuşmanın aynı önekini kullanır
    // (aynı sistem prompt'u, aynı mesaj dizisi) ve talimatı en sona ekler —
    // oturumun en büyük isteği bu olduğu için önbellek isabeti burada çok değerli.
    const response = await this.#request({
      model: this.modelId,
      temperature: 0.2,
      messages: [
        ...this.#sdkMessages(),
        {
          role: "user",
          content:
            "Now summarize this conversation concisely, preserving all information useful for the next steps (file paths, decisions made, changes applied, open tasks, user preferences). Write only the summary.",
        },
      ],
    });

    const summary = (response.choices?.[0]?.message?.content ?? "").trim();
    if (!summary) return { summary: "", tokens: 0 };

    this.messages = [
      { role: "system", content: this.#systemContent() },
      {
        role: "user",
        content: `[SUMMARY] Summary of the previous conversation:\n${summary}`,
      },
      {
        role: "assistant",
        content: "I've got the summary. We can continue where we left off.",
      },
    ];

    const tokens = messagesTokenCount(this.messages);

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
      // HTTP durumu olmayabilir (akış ortasında gelen hata); o durumda sunucunun
      // hata kodunu gösteriyoruz, "Kod: ?" kullanıcıyı yanıltıyordu.
      const detail = error as { code?: unknown; type?: unknown };
      const code = error.status ?? detail.code ?? detail.type;
      sink.error?.(
        t("agent.apiError", { status: code ?? "?", message: error.message }),
      );
    } else if (error instanceof RequestTimeoutError) {
      sink.error?.(t("agent.timeout", { seconds: Math.round(REQUEST_TIMEOUT_MS / 1000) }));
    } else {
      sink.error?.(t("agent.unknownError", { message: String(errorProp(error, "message")) }));
    }
  }
}
