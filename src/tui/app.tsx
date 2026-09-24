import fs from "node:fs";
import wrapAnsi from "wrap-ansi";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Box, Text, useApp, useInput, useStdout } from "ink";
import type { Key } from "ink";
import { AVAILABLE_MODELS, CONTEXT_WINDOW, getModelInfo, saveConfig } from "../config.js";
import { getSystemPrompt } from "../agent.js";
import { listSessions, saveSession } from "../session.js";
import type {
  ChatMessage,
  ItemId,
  Session,
  TranscriptItem,
  TranscriptMeta,
} from "../session.js";
import type { ToolArgs, ToolResult } from "../tools.js";
import {
  fetchAccount,
  formatAccount,
  verifyApiKey,
  verifyFailureMessage,
} from "../account.js";
import type { AccountInfo } from "../account.js";
import { copyToClipboard } from "../clipboard.js";
import { plain, sliceByWidth, errorProp } from "../utils.js";
import { isUnsafeWorkspace } from "../workspace.js";
import { t, setLocale, getLocale, localeTag, LANGUAGES } from "../i18n/index.js";
import type { LanguageCode } from "../i18n/index.js";
import { requestCancel } from "../cancel.js";
import { useBlink } from "./hooks.js";
import { applyTheme, theme, themeNames } from "./theme.js";
import { KEYBINDS, matchesKey } from "./keybinds.js";
import { notify, ring } from "./notify.js";
import { debugEnabled, debugLog } from "../debug.js";
import type { KeybindMap } from "./keybinds.js";
import { setTitle, parseMouse, disableMouse } from "./screen.js";
import { buildTranscript } from "./view.js";
import {
  buildView,
  createTokens,
  toText,
  endCursor,
  insertText,
  insertPaste,
  backspace,
  deleteForward,
  moveLeft,
  moveRight,
  MAX_INPUT_LINES,
} from "./input-model.js";
import type { Cursor, InputToken } from "./input-model.js";
import { Home } from "./screens/home.js";
import { Transcript } from "./components/transcript.js";
import type { TextSelection } from "./components/transcript.js";
import { InputBar } from "./components/input-bar.js";
import { WorkingIndicator } from "./components/working.js";
import { StatusRow, BottomBar } from "./components/status-bar.js";
import { Approval } from "./components/approval.js";
import { Permission } from "./components/permission.js";
import { Question } from "./components/question.js";
import type { QuestionOption } from "./components/question.js";
import { Menu } from "./components/menu.js";
import type { MenuItem } from "./components/menu.js";
import type {
  AskPermissionRequest,
  AskUserAnswer,
  AskUserRequest,
  PermissionDecision,
  Sink,
} from "../sink.js";

// Ajanın App'te kullanılan yüzeyi. Sınıfın tamamı gerekmiyor; yapısal tip
// yeterli, böylece testler de sahte bir ajan verebiliyor.
interface RemoteModel {
  id?: string;
  name?: string;
  context_window?: number;
  owned_by?: string;
}

export interface AppAgent {
  apiKey: string;
  messages: ChatMessage[];
  modelId: string;
  mode?: string;
  messageCount: number;
  client: { models: { list(): Promise<{ data?: RemoteModel[] }> } };
  setApiKey(key: string): void;
  setModel(id: string): void;
  setMode(mode: string): void;
  clearHistory(): void;
  updateCwd(): void;
  compact(): Promise<{ summary?: string; tokens?: number } | null | undefined>;
  generateTitle(): Promise<string>;
  chatStep(input: string, sink: unknown): Promise<unknown>;
}

interface ModelMeta {
  contextWindow: number | null;
}

interface OverlayItem extends MenuItem {
  session?: Session | null;
}

type OverlayKind = "palette" | "lang" | "models" | "sessions";

interface OverlayState {
  kind: OverlayKind;
  query: string;
  index: number;
  items?: OverlayItem[];
}

interface ApprovalState {
  command: string;
  allow: boolean;
  resolve: (allowed: boolean) => void;
}

interface PermissionState {
  tool?: string;
  path?: unknown;
  resolved?: string;
  grant?: string;
  pattern?: string;
  choice: number;
  resolve: (decision: PermissionDecision) => void;
}

interface QuestionState {
  question: string;
  options: QuestionOption[];
  index: number;
  typing: boolean;
  resolve: (answer: AskUserAnswer) => void;
}

const MODEL_ITEMS: OverlayItem[] = Object.values(AVAILABLE_MODELS).map((model) => ({
  value: model.id,
  left: model.name,
  right: model.id,
}));

const LANG_ITEMS: OverlayItem[] = LANGUAGES.map((lang) => ({
  value: lang.code,
  left: lang.label,
  right: lang.code,
}));

function commandItems(): OverlayItem[] {
  return [
    { value: "auto", desc: t("commands.auto") },
    { value: "compact", desc: t("commands.compact") },
    { value: "exit", desc: t("commands.exit") },
    { value: "help", desc: t("commands.help") },
    { value: "key", desc: t("commands.key") },
    { value: "lang", desc: t("commands.lang") },
    { value: "me", desc: t("commands.me") },
    { value: "model", desc: t("commands.model") },
    { value: "new", desc: t("commands.new") },
    { value: "sessions", desc: t("commands.sessions") },
    { value: "status", desc: t("commands.status") },
  ].map((command) => ({
    value: command.value,
    left: `/${command.value}`,
    right: command.desc,
  }));
}

// Transkriptin ilk satırının ekran satırı (1 tabanlı), güvensiz dizin uyarısı
// yokken. Uyarı çizildiğinde transkript onun kapladığı kadar aşağı kayar; bu
// yüzden çalışma zamanında ekleniyor (bkz. transcriptTop).
const TRANSCRIPT_TOP = 2;
const TRANSCRIPT_LEFT = 3; // transkriptin ilk kolonunun ekran kolonu (1 tabanlı)
const AUTO_COMPACT_RATIO = 0.85;
// Akış sırasındaki düşünme kartının kimliği: henüz `items` içinde değil.
const LIVE_THINKING_ID = "thinking-live";

function normalizeSelection(selection: TextSelection): TextSelection {
  const { startLine, startCol, endLine, endCol } = selection;
  if (startLine < endLine || (startLine === endLine && startCol <= endCol)) {
    return { startLine, startCol, endLine, endCol };
  }
  return { startLine: endLine, startCol: endCol, endLine: startLine, endCol: startCol };
}

function rebuildItems(messages: ChatMessage[]): TranscriptItem[] {
  const out: TranscriptItem[] = [];
  let id = 0;
  for (const message of messages) {
    if (message.role === "user" && typeof message.content === "string" && message.content.trim()) {
      out.push({ id: (id += 1), role: "user", text: message.content });
    } else if (
      message.role === "assistant" &&
      typeof message.content === "string" &&
      message.content.trim()
    ) {
      out.push({
        id: (id += 1),
        role: "assistant",
        text: message.content,
        meta: { modelName: "" },
      });
    }
  }
  return out;
}

function filterBy(items: OverlayItem[], query: string): OverlayItem[] {
  if (!query) return items;
  const q = query.toLowerCase();
  return items.filter((item) =>
    `${item.left} ${item.right} ${item.value}`.toLowerCase().includes(q),
  );
}

export function App({
  agent,
  version,
  initialModelId,
  initialAutoApprove = false,
  session,
}: {
  agent: AppAgent;
  version: string;
  initialModelId: string;
  initialAutoApprove?: boolean;
  session?: Session | null;
}) {
  void version;
  const { exit } = useApp();
  const { stdout } = useStdout();
  const rows = stdout?.rows ?? 30;
  const columns = stdout?.columns ?? 100;
  const width = Math.max(40, columns - 4);
  const blink = useBlink(530);

  const initialItems = useMemo(() => {
    const stored = session?.items ?? [];
    const base = stored.length > 0 ? stored : rebuildItems(session?.messages ?? []);
    return base.map((entry, index) => ({ ...entry, id: index + 1 }));
  }, [session]);

  const [items, setItems] = useState<TranscriptItem[]>(initialItems);
  const [liveText, setLiveText] = useState("");
  const [liveThinking, setLiveThinking] = useState("");
  const [liveThinkingExpanded, setLiveThinkingExpandedState] = useState(false);
  const [busy, setBusy] = useState(false);
  const [inputTokens, setInputTokens] = useState<InputToken[]>([]);
  const [caret, setCaret] = useState<Cursor>({ i: 0, o: 0 });
  const [slashIndex, setSlashIndex] = useState(0);
  const [started, setStarted] = useState(initialItems.length > 0);
  const [sessionName, setSessionName] = useState("WenOX");
  const [sessionTitle, setSessionTitle] = useState(session?.title ?? "");
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [credits, setCredits] = useState<number | null>(null);
  const [remoteModels, setRemoteModels] = useState<OverlayItem[] | null>(null);
  const [modelMeta, setModelMeta] = useState<Record<string, ModelMeta>>({});
  const [selection, setSelection] = useState<TextSelection | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [lang, setLang] = useState<LanguageCode>(getLocale());
  const [mode, setMode] = useState(agent.mode ?? "plan");
  const [modelId, setModelId] = useState(initialModelId);
  const [autoApprove, setAutoApprove] = useState(initialAutoApprove);
  const [overlay, setOverlay] = useState<OverlayState | null>(null);
  const [approval, setApproval] = useState<ApprovalState | null>(null);
  const [permission, setPermission] = useState<PermissionState | null>(null);
  const [question, setQuestion] = useState<QuestionState | null>(null);
  const [keyMode, setKeyMode] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [tokens, setTokens] = useState(session?.tokens ?? 0);
  const selectionRef = useRef<TextSelection | null>(null);
  const draggingRef = useRef(false);
  const pressRef = useRef<{ line: number; col: number } | null>(null);
  const ownersRef = useRef<ItemId[]>([]);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [follow, setFollow] = useState(true);
  const offsetRef = useRef(0);
  const maxOffsetRef = useRef(0);

  const idRef = useRef(initialItems.length);
  const itemsRef = useRef<TranscriptItem[]>(initialItems);
  const queuedRef = useRef<{ id: number; text: string }[]>([]);
  const drivingRef = useRef(false);
  const busyRef = useRef(false);
  const tokensRef = useRef(session?.tokens ?? 0);
  const contextWindowRef = useRef(CONTEXT_WINDOW);
  const warnedRef = useRef(false);
  const liveThinkingExpandedRef = useRef(false);
  const setLiveThinkingExpanded = (value: boolean): void => {
    liveThinkingExpandedRef.current = value;
    setLiveThinkingExpandedState(value);
  };
  const push = useCallback((item: Omit<TranscriptItem, "id">) => {
    idRef.current += 1;
    const id = idRef.current;
    itemsRef.current = [...itemsRef.current, { ...item, id }];
    setItems(itemsRef.current);
  }, []);

  const loadRemoteModels = useCallback(async (): Promise<OverlayItem[] | null> => {
    try {
      const page = await agent.client.models.list();
      const list = Array.isArray(page?.data) ? page.data : [];
      if (list.length === 0) return null;

      const metas: Record<string, ModelMeta> = {};
      const items = list.map((model) => {
        const id = model?.id ?? String(model);
        const name = model?.name && model.name !== id ? model.name : id;
        const extras: string[] = [];
        if (name !== id) extras.push(id);
        if (model?.context_window) {
          extras.push(
            t("models.contextWindow", { k: Math.round(model.context_window / 1000) }),
          );
        }
        if (model?.owned_by) extras.push(model.owned_by);
        metas[id] = {
          contextWindow: Number(model?.context_window) || null,
        };
        return { value: id, left: name, right: extras.join("  ·  ") };
      });

      setModelMeta(metas);
      setRemoteModels(items);
      return items;
    } catch {
      return null;
    }
  }, [agent]);

  const [unsafeWorkspace, setUnsafeWorkspace] = useState(() => isUnsafeWorkspace(process.cwd()));
  const refreshUnsafeWorkspace = useCallback(() => {
    setUnsafeWorkspace(isUnsafeWorkspace(process.cwd()));
  }, []);

  const refreshAccount = useCallback(async () => {
    const info = await fetchAccount(agent.apiKey);
    if (!info) return;
    setAccount(info);
    if (typeof info.credits_remaining === "number") setCredits(info.credits_remaining);
  }, [agent]);

  const syncSession = useCallback(
    (persist = true) => {
      if (!session) return;
      session.messages = agent.messages.slice(1);
      session.items = itemsRef.current;
      session.tokens = tokensRef.current;
      session.model = agent.modelId;
      session.cwd = process.cwd();
      if (persist) saveSession(session);
    },
    [agent, session],
  );

  // Çıkışta (özellikle /exit ile) oturumun güncel içeriğini yaz: sohbet olmadan
  // yalnızca komut kullanıldıysa senkron hiç çalışmamış olur ve oturum boş kalır.
  useEffect(() => () => syncSession(false), [syncSession]);

  const maybeTitle = useCallback(async () => {
    if (!session || session.title) return;
    const userCount = itemsRef.current.filter((entry) => entry.role === "user").length;
    if (userCount < 4) return;
    try {
      const title = await agent.generateTitle();
      if (title) {
        session.title = title;
        setSessionTitle(title);
        syncSession();
      }
    } catch {
      // başlık üretilemezse sorun değil
    }
  }, [agent, session, syncSession]);

  const resume = useCallback(
    (loaded: Session | null | undefined) => {
      if (!loaded) return;
      try {
        agent.messages = [
          { role: "system", content: getSystemPrompt(agent.mode) },
          ...(loaded.messages ?? []),
        ];
        if (loaded.model) {
          agent.setModel(loaded.model);
          setModelId(loaded.model);
        }
        if (loaded.cwd && fs.existsSync(loaded.cwd)) {
          process.chdir(loaded.cwd);
          agent.updateCwd();
        }
      } catch {
        // eksik/bozuk oturum alanları sorun çıkarmasın
      }

      let restored: TranscriptItem[] = (loaded.items ?? []).map((entry, index) => ({
        ...entry,
        id: index + 1,
      }));
      if (restored.length === 0 && (loaded.messages ?? []).length > 0) {
        restored = rebuildItems(loaded.messages);
      }
      idRef.current = restored.length;
      itemsRef.current = restored;
      setItems(restored);
      tokensRef.current = loaded.tokens ?? 0;
      setTokens(loaded.tokens ?? 0);
      warnedRef.current = false;

      if (session) {
        session.id = loaded.id;
        session.title = loaded.title ?? "";
        session.messages = [...(loaded.messages ?? [])];
        session.items = restored;
        session.tokens = loaded.tokens ?? 0;
        session.cwd = loaded.cwd ?? process.cwd();
        session.model = loaded.model ?? agent.modelId;
      }

      setSessionTitle(loaded.title ?? "");
      setStarted(true);
      setFollow(true);
      push({ role: "info", text: t("session.loaded", { name: loaded.title || loaded.id }) });
      refreshUnsafeWorkspace();
    },
    [agent, push, session, refreshUnsafeWorkspace],
  );

  const sink = useMemo<Sink>(
    () => ({
      thinking: () => {
        setBusy(true);
        busyRef.current = true;
      },
      assistantUpdate: (text: string, reasoning?: string) => {
        setLiveThinking(reasoning ?? "");
        setLiveText(text);
      },
      assistantEnd: (text: string, meta?: TranscriptMeta) => {
        setLiveText("");
        setLiveThinking("");
        if (meta?.usage?.total_tokens) {
          tokensRef.current += meta.usage.total_tokens;
          setTokens(tokensRef.current);
          if (!warnedRef.current && tokensRef.current > contextWindowRef.current * 0.7) {
            warnedRef.current = true;
            const pct = Math.round((tokensRef.current / contextWindowRef.current) * 100);
            push({
              role: "info",
              text: t("context.warning", { pct }),
            });
          }
        }
        if (meta?.reasoning) {
          // Kart, akış sırasında kullanıcının bıraktığı durumda kalır.
          push({
            role: "thinking",
            text: meta.reasoning,
            meta: { thinkingDurationMs: meta.thinkingDurationMs },
            expanded: liveThinkingExpandedRef.current,
          });
        }
        setLiveThinkingExpanded(false);
        if (text && text.trim()) push({ role: "assistant", text, meta });
      },
      assistantClear: () => {
        setLiveText("");
        setLiveThinking("");
      },
      toolCall: (name: string, args: ToolArgs) => {
        setLiveText("");
        push({ role: "tool-call", name, args });
      },
      toolResult: (name: string, result: ToolResult) =>
        push({ role: "tool-result", name, result }),
      info: (text: string) => push({ role: "info", text }),
      error: (text: string) => {
        setLiveText("");
        push({ role: "error", text });
      },
      askApproval: (command: string) =>
        new Promise<boolean>((resolve) => {
          setApproval({ command, resolve, allow: true });
        }),
      askPermission: ({ tool, path: target, resolved, grant, pattern }: AskPermissionRequest) =>
        new Promise<PermissionDecision>((resolve) => {
          setPermission({ tool, path: target, resolved, grant, pattern, choice: 0, resolve });
        }),
      askUser: ({ question: promptText, options }: AskUserRequest) =>
        new Promise<AskUserAnswer>((resolve) => {
          setQuestion({
            question: promptText,
            options: options ?? [],
            resolve,
            index: 0,
            typing: false,
          });
        }),
    }),
    [push],
  );

  const runCommand = useCallback(
    async (raw: string): Promise<void> => {
      const [cmd, ...rest] = raw.slice(1).split(/\s+/);
      const arg = rest.join(" ");
      void arg;
      switch ((cmd ?? "").toLowerCase()) {
        case "exit":
        case "quit":
          disableMouse();
          exit();
          return;
        case "new":
        case "clear":
          agent.clearHistory();
          itemsRef.current = [];
          setItems([]);
          setTokens(0);
          tokensRef.current = 0;
          warnedRef.current = false;
          push({ role: "info", text: t("context.cleared") });
          return;
        case "compact": {
          if (busyRef.current) {
            push({ role: "info", text: t("compact.busy") });
            return;
          }
          if (agent.messageCount === 0) {
            push({ role: "info", text: t("compact.empty") });
            return;
          }
          push({ role: "info", text: t("compact.running") });
          try {
            const result = await agent.compact();
            const summary = result?.summary ?? "";
            if (!summary) {
              push({ role: "info", text: t("compact.empty") });
              return;
            }
            tokensRef.current = result?.tokens ?? 0;
            warnedRef.current = false;
            setTokens(result?.tokens ?? 0);
            const shown = summary.length > 600 ? `${summary.slice(0, 600)}…` : summary;
            push({ role: "info", text: t("compact.done", { summary: shown }) });
          } catch (error) {
            const aborted =
              errorProp(error, "name") === "AbortError" ||
              /abort/i.test(String(errorProp(error, "message") ?? ""));
            push({
              role: aborted ? "info" : "error",
              text: aborted
                ? t("agent.cancelled")
                : t("compact.failed", { message: String(errorProp(error, "message")) }),
            });
          }
          return;
        }
        case "help":
          push({ role: "info", text: t("help.tui") });
          return;
        case "lang":
          setOverlay({ kind: "lang", query: "", index: 0, items: LANG_ITEMS });
          return;
        case "model": {
          const items = await loadRemoteModels();
          if (!items) {
            push({ role: "info", text: t("models.fetchFailed") });
          }
          setOverlay({ kind: "models", query: "", index: 0, items: items ?? MODEL_ITEMS });
          return;
        }
        case "key":
          setKeyMode(true);
          setInputTokens([]);
          setCaret({ i: 0, o: 0 });
          return;
        case "me": {
          const info = await fetchAccount(agent.apiKey);
          if (info) {
            setAccount(info);
            if (typeof info.credits_remaining === "number") setCredits(info.credits_remaining);
          }
          push({ role: "info", text: formatAccount(info) });
          return;
        }
        case "sessions": {
          const all = listSessions();
          if (all.length === 0) {
            push({ role: "info", text: t("session.none") });
            return;
          }
          setOverlay({
            kind: "sessions",
            query: "",
            index: 0,
            items: all.map((item) => ({
              value: item.id,
              left: item.title || t("session.untitled"),
              right: `${new Date(item.updatedAt ?? Date.now()).toLocaleString(localeTag())}  ·  ${
                item.cwd ?? ""
              }`,
              session: item,
            })),
          });
          return;
        }
        case "auto": {
          const next = !autoApprove;
          setAutoApprove(next);
          push({ role: "info", text: t(next ? "auto.on" : "auto.off") });
          return;
        }
        case "status":
          push({
            role: "info",
            text: t("statusLine", {
              model: getModelInfo(modelId).name,
              cwd: process.cwd(),
              auto: t(autoApprove ? "common.on" : "common.off"),
              count: agent.messageCount,
            }),
          });
          return;
        default:
          push({ role: "error", text: t("notices.unknownCommand", { cmd: cmd ?? "" }) });
      }
    },
    [agent, autoApprove, exit, loadRemoteModels, modelId, push],
  );

  const applyKey = useCallback(
    async (value: string): Promise<void> => {
      const key = value.trim();
      if (!key) return;
      push({ role: "info", text: t("onboarding.verifying") });
      const result = await verifyApiKey(key);
      if (!result.ok) {
        push({ role: "error", text: verifyFailureMessage(result.reason) });
        return;
      }
      agent.setApiKey(key);
      saveConfig({ apiKey: key });
      if (result.account) {
        setAccount(result.account);
        if (typeof result.account.credits_remaining === "number") {
          setCredits(result.account.credits_remaining);
        }
      }
      push({ role: "info", text: t("notices.apiKeyUpdated") });
      if (result.account?.name) {
        push({ role: "info", text: t("notices.apiKeyAccount", { name: result.account.name }) });
      }
    },
    [agent, push],
  );

  const resetInput = useCallback(() => {
    setInputTokens([]);
    setCaret({ i: 0, o: 0 });
    setSlashIndex(0);
  }, []);

  const drive = useCallback(async (): Promise<void> => {
    if (drivingRef.current) return;
    drivingRef.current = true;
    setBusy(true);
    busyRef.current = true;

    try {
      while (queuedRef.current.length > 0) {
        const item = queuedRef.current[0];
        queuedRef.current = queuedRef.current.slice(1);
        itemsRef.current = itemsRef.current.map((entry) =>
          entry.id === item.id ? { ...entry, queued: false } : entry,
        );
        setItems(itemsRef.current);

        try {
          await agent.chatStep(item.text, sink);
        } catch (error) {
          push({
            role: "error",
            text: t("notices.errorPrefix", { message: String(errorProp(error, "message")) }),
          });
        }
      }

      if (
        agent.messageCount > 0 &&
        contextWindowRef.current > 0 &&
        tokensRef.current >= contextWindowRef.current * AUTO_COMPACT_RATIO
      ) {
        push({ role: "info", text: t("compact.auto") });
        try {
          const result = await agent.compact();
          if (result?.tokens != null) {
            tokensRef.current = result.tokens;
            setTokens(result.tokens);
          }
          warnedRef.current = false;
          push({ role: "info", text: t("compact.summarized") });
        } catch {
          // otomatik compact başarısız olsa da oturum devam etmeli
        }
      }
    } finally {
      drivingRef.current = false;
      busyRef.current = false;
      setBusy(false);
      setLiveText("");
      syncSession();
      void maybeTitle();
      void refreshAccount();
    }
  }, [agent, maybeTitle, push, refreshAccount, sink, syncSession]);

  const handleSubmit = useCallback(
    async (raw: string): Promise<void> => {
      const text = (raw ?? "").trim();
      if (!text || approval) return;
      resetInput();

      setHistory((prev) => [...prev.filter((entry) => entry !== text), text].slice(-50));
      setHistoryIndex(-1);
      if (!started) {
        setSessionName(text.slice(0, 24));
        setStarted(true);
      }
      setFollow(true);

      if (text.startsWith("/")) {
        await runCommand(text);
        return;
      }

      idRef.current += 1;
      const id = idRef.current;
      itemsRef.current = [
        ...itemsRef.current,
        { id, role: "user", text, queued: busyRef.current },
      ];
      setItems(itemsRef.current);
      queuedRef.current = [...queuedRef.current, { id, text }];

      await drive();
    },
    [approval, drive, resetInput, runCommand, started],
  );

  const resolveApproval = (allowed: boolean): void => {
    if (!approval) return;
    approval.resolve(allowed);
    setApproval(null);
    if (!allowed) push({ role: "info", text: t("notices.commandRejected") });
  };

  const resolvePermission = (decision: PermissionDecision): void => {
    const resolve = permission?.resolve;
    setPermission(null);
    resolve?.(decision);
  };

  // Komut kartına tıklayınca aç/kapa (opencode'daki "click to expand")
  const toggleCardAt = useCallback((lineIndex: number): void => {
    const id = ownersRef.current[lineIndex];
    if (id == null) return;
    // Akış sırasındaki düşünme kartı henüz `items` içinde değil, ayrı bayrakta.
    if (id === LIVE_THINKING_ID) {
      setLiveThinkingExpanded(!liveThinkingExpandedRef.current);
      return;
    }
    const items = itemsRef.current;
    const clicked = items.find((entry) => entry.id === id);
    if (!clicked) return;

    if (clicked.role === "thinking") {
      itemsRef.current = items.map((entry) =>
        entry.id === clicked.id ? { ...entry, expanded: !entry.expanded } : entry,
      );
      setItems(itemsRef.current);
      return;
    }

    let target: TranscriptItem | undefined = clicked;
    if (clicked.role === "tool-call" && clicked.name === "run_command") {
      const index = items.indexOf(clicked);
      target = items
        .slice(index)
        .find((entry) => entry.role === "tool-result" && entry.name === "run_command");
    }
    if (!target || target.role !== "tool-result" || target.name !== "run_command") return;

    itemsRef.current = items.map((entry) =>
      entry.id === target.id ? { ...entry, expanded: !entry.expanded } : entry,
    );
    setItems(itemsRef.current);
  }, []);

  // İptal: çalışan isteği durdur + kuyruktaki bekleyen mesajları da bırak
  // Sürükleme durumunu ve seçimi bırakır: iptal/kapatma sırasında çağrılır.
  const clearSelectionDrag = (): void => {
    draggingRef.current = false;
    pressRef.current = null;
    setSel(null);
  };

  const cancelWork = useCallback((): void => {
    debugLog("cancelWork çağrıldı");
    requestCancel();
    if (queuedRef.current.length > 0) {
      const ids = new Set(queuedRef.current.map((item) => item.id));
      queuedRef.current = [];
      itemsRef.current = itemsRef.current.map((entry) =>
        ids.has(entry.id as number) ? { ...entry, queued: false } : entry,
      );
      setItems(itemsRef.current);
      push({ role: "info", text: t("notices.queueCleared") });
    }
  }, [push]);

  const selectModel = (value: string): void => {
    agent.setModel(value);
    setModelId(value);
    saveConfig({ currentModel: value });
    push({ role: "info", text: t("notices.modelSelected", { name: getModelInfo(value).name }) });
  };

  const selectLanguage = (code: string): void => {
    setLocale(code);
    setLang(getLocale());
    saveConfig({ language: code });
    const name = LANGUAGES.find((entry) => entry.code === code)?.label ?? code;
    push({ role: "info", text: t("lang.selected", { name }) });
  };

  const toggleMode = (): void => {
    const next = mode === "build" ? "plan" : "build";
    agent.setMode(next);
    setMode(next);
    push({
      role: "info",
      text: t("notices.modeChanged", {
        mode: next === "plan" ? t("status.modePlan") : t("status.modeBuild"),
      }),
    });
  };

  const displayItems = useMemo(() => {
    const list = [...items];
    // Düşünme cevaptan önce akar; canlıyken kendi kartında görünür.
    if (liveThinking) {
      list.push({
        id: LIVE_THINKING_ID,
        role: "thinking",
        text: liveThinking,
        expanded: liveThinkingExpanded,
      });
    }
    if (liveText) {
      list.push({
        id: "live",
        role: "assistant",
        text: liveText,
        live: true,
        meta: { modelName: getModelInfo(modelId).name },
      });
    }
    return list;
  }, [items, liveText, liveThinking, liveThinkingExpanded, modelId]);

  const lines = useMemo(() => {
    const transcript = buildTranscript(displayItems, width);
    ownersRef.current = transcript.owners;
    return transcript.lines;
  }, [displayItems, width, lang]);

  const commands = useMemo(() => commandItems(), [lang]);

  const activeMeta = modelMeta[modelId] ?? { contextWindow: null };
  const contextWindow = activeMeta.contextWindow || CONTEXT_WINDOW;
  contextWindowRef.current = contextWindow;

  const overlayList = overlay
    ? filterBy(
        overlay.kind === "palette" ? commands : (overlay.items ?? MODEL_ITEMS),
        overlay.query,
      )
    : [];

  const inputText = toText(inputTokens);
  const inputView = buildView(inputTokens, Math.max(12, columns - 10), caret, {
    mask: keyMode ? "*" : undefined,
    maxLines: MAX_INPUT_LINES,
  });

  const slashQuery =
    inputText.startsWith("/") && !inputText.includes(" ") ? inputText.slice(1) : null;
  const slashItems = slashQuery !== null ? filterBy(commands, slashQuery) : [];
  const interactive = !approval && !permission && !overlay && !keyMode;
  const slashOpen = interactive && slashQuery !== null;
  const slashActive = Math.min(slashIndex, Math.max(0, slashItems.length - 1));

  let extraRows = 0;
  if (overlay) extraRows += Math.min(overlayList.length, 10) + 4;
  if (slashOpen) extraRows += Math.min(slashItems.length, 9) + 3;
  if (approval) extraRows += 5;
  if (permission) extraRows += 10;
  if (unsafeWorkspace) extraRows += 3;
  if (question) extraRows += (question.options.length + 1) * 2 + 4;

  const viewportHeight = Math.max(4, rows - 8 - inputView.lines.length - extraRows);
  const maxOffset = Math.max(0, lines.length - viewportHeight);
  maxOffsetRef.current = maxOffset;

  useEffect(() => {
    const next = follow ? maxOffset : Math.min(offsetRef.current, maxOffset);
    offsetRef.current = next;
    setScrollOffset(next);
  }, [maxOffset, follow]);

  useEffect(() => {
    void refreshAccount();
  }, [refreshAccount]);

  useEffect(() => {
    void loadRemoteModels();
  }, [loadRemoteModels]);

  useEffect(() => {
    const name = sessionTitle || sessionName;
    setTitle(started ? `WenOX CLI | ${name}` : "WenOX CLI");
  }, [started, sessionName, sessionTitle]);

  const setSel = (value: TextSelection | null): void => {
    selectionRef.current = value;
    setSelection(value);
  };

  // Güvensiz dizin uyarısı transkriptin ÜSTÜNDE çiziliyor, yani uyarı
  // göründüğünde transkript o kadar satır aşağı kayıyor. Fare→satır eşlemesi
  // bunu hesaba katmazsa seçim imlecin birkaç satır ALTINA düşer ya da hiç
  // oluşmaz (alt satırlarda hesaplanan indeks görünür alanı aşıyor).
  const warningRows = unsafeWorkspace
    ? wrapAnsi(t("notices.unsafeDir", { cwd: process.cwd() }), Math.max(1, columns - 4), {
        hard: true,
        trim: false,
        wordWrap: true,
      }).split("\n").length
    : 0;
  const transcriptTop = TRANSCRIPT_TOP + (warningRows > 0 ? warningRows + 1 : 0);

  const toTranscriptPos = (
    x: number,
    y: number,
    clamp = false,
  ): { line: number; col: number } | null => {
    if (!started || lines.length === 0) return null;
    const rel = y - transcriptTop;
    if (!clamp && (rel < 0 || rel >= viewportHeight)) return null;
    const clamped = Math.max(0, Math.min(viewportHeight - 1, rel));
    return {
      line: Math.max(0, Math.min(lines.length - 1, scrollOffset + clamped)),
      col: Math.max(0, x - TRANSCRIPT_LEFT),
    };
  };

  const selectionText = (sel: TextSelection): string => {
    const { startLine, startCol, endLine, endCol } = normalizeSelection(sel);
    const out: string[] = [];
    for (let i = startLine; i <= endLine; i += 1) {
      const line = lines[i] ?? "";
      if (i === startLine && i === endLine) out.push(sliceByWidth(line, startCol, endCol));
      else if (i === startLine) out.push(sliceByWidth(line, startCol, Number.MAX_SAFE_INTEGER));
      else if (i === endLine) out.push(sliceByWidth(line, 0, endCol));
      else out.push(plain(line));
    }
    return out
      .map((line) => line.replace(/^\s*│ ?/, "").replace(/[ \t]+$/, ""))
      .filter(
        (line) =>
          !/^(▣ Build|✎|❓|\+ (Düşünen|Thinking):|[+−] (Düşünüyor|Thinking|Düşündü|Thought)|→ (Soru soruldu|Question asked))/.test(
            line.trim(),
          ),
      )
      .join("\n");
  };

  const cleanCopy = (text: string): string =>
    text
      .replace(/[ \t]+$/gm, "")
      .replace(/\n{2,}/g, "\n")
      .replace(/^\n+|\n+$/g, "");

  const copySelection = (): boolean => {
    const sel = selectionRef.current;
    if (!sel) return false;
    setSel(null);
    const text = cleanCopy(selectionText(sel));
    if (!text.trim()) return false;
    copyToClipboard(text);
    setToast(t("notices.copied"));
    return true;
  };

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(null), 1600);
    return () => clearTimeout(timer);
  }, [toast]);

  const scrollBy = (delta: number): void => {
    const next = Math.max(0, Math.min(maxOffsetRef.current, offsetRef.current + delta));
    offsetRef.current = next;
    setScrollOffset(next);
    setFollow(next >= maxOffsetRef.current);
  };

  const selectOverlay = (state: OverlayState, selected: OverlayItem): void => {
    if (state.kind === "palette") {
      void handleSubmit(`/${selected.value}`);
      return;
    }
    if (state.kind === "sessions") {
      resume(selected.session);
      return;
    }
    if (state.kind === "lang") {
      selectLanguage(selected.value);
      return;
    }
    selectModel(selected.value);
  };

  const editInput = (char: string | undefined, key: Key): void => {
    if (key.leftArrow) {
      setCaret((current) => moveLeft(inputTokens, current));
      return;
    }
    if (key.rightArrow) {
      setCaret((current) => moveRight(inputTokens, current));
      return;
    }
    if (key.backspace) {
      const next = backspace(inputTokens, caret);
      setInputTokens(next.tokens);
      setCaret(next.cursor);
      setSlashIndex(0);
      return;
    }
    if (key.delete) {
      const next = deleteForward(inputTokens, caret);
      setInputTokens(next.tokens);
      setCaret(next.cursor);
      setSlashIndex(0);
      return;
    }
    if (char && !key.ctrl && !key.meta) {
      const charLines = char.split("\n").length;
      if (charLines > 2 || char.length > 120) {
        const next = insertPaste(inputTokens, caret, char, charLines);
        setInputTokens(next.tokens);
        setCaret(next.cursor);
      } else {
        const next = insertText(inputTokens, caret, char.replace(/\r?\n/g, " "));
        setInputTokens(next.tokens);
        setCaret(next.cursor);
      }
      setSlashIndex(0);
    }
  };

  const recall = (text: string): void => {
    const restored = createTokens(text);
    setInputTokens(restored);
    setCaret(endCursor(restored));
  };

  const historyPrev = (): void => {
    if (history.length === 0) return;
    const next = historyIndex <= 0 ? history.length - 1 : historyIndex - 1;
    setHistoryIndex(next);
    recall(history[next]);
  };

  const historyNext = (): void => {
    if (historyIndex >= history.length - 1) {
      setHistoryIndex(-1);
      resetInput();
      return;
    }
    const next = historyIndex + 1;
    setHistoryIndex(next);
    recall(history[next]);
  };

  useInput((char, key) => {
    if (debugEnabled()) {
      debugLog(
        `tuş char=${JSON.stringify(char)} esc=${Boolean(key.escape)} ctrl=${Boolean(key.ctrl)} ` +
          `busy=${busyRef.current} sel=${Boolean(selectionRef.current)} overlay=${Boolean(overlay)}`,
      );
    }
    const mouse = parseMouse(char);
    if (mouse) {
      if (mouse.type === "wheel-up") {
        scrollBy(-3);
        return;
      }
      if (mouse.type === "wheel-down") {
        scrollBy(3);
        return;
      }
      if (mouse.type === "press" && mouse.button === 0) {
        const pos = toTranscriptPos(mouse.x, mouse.y);
        pressRef.current = pos;
        if (pos) {
          draggingRef.current = true;
          setSel({
            startLine: pos.line,
            startCol: pos.col,
            endLine: pos.line,
            endCol: pos.col,
          });
        } else {
          setSel(null);
        }
        return;
      }
      if (mouse.type === "motion" && draggingRef.current && selectionRef.current) {
        const pos = toTranscriptPos(mouse.x, mouse.y, true);
        if (pos) setSel({ ...selectionRef.current, endLine: pos.line, endCol: pos.col });
        return;
      }
      if (mouse.type === "release") {
        const press = pressRef.current;
        const dragging = draggingRef.current;
        pressRef.current = null;
        draggingRef.current = false;
        if (!press || !dragging) return;
        // Sürüklerken seçim başlar; tıkta ise bırakma noktası basma noktasının
        // üstünde kalır. Gerçek fareler tıklarken bile bir hücre kayabildiği
        // için tek hücrelik sapma da tık sayılıyor.
        const pos = toTranscriptPos(mouse.x, mouse.y, true);
        const isClick = pos && pos.line === press.line && Math.abs(pos.col - press.col) <= 1;
        if (isClick) {
          toggleCardAt(press.line);
          setSel(null);
        }
        return;
      }
      return;
    }
    if (/^\[M/.test(char ?? "")) return;

    // Bazı terminaller ESC'yi isEsc olmadan ham karakter olarak gönderir
    const isEsc = key.escape || char === "\x1b";

    // Evrensel kaçış: Ctrl+C her durumda çalışır — açık paneli kapatır, meşgulken
    // iptal eder, boştaysa çıkar. Böylece hiçbir durumda kilitli kalınmaz.
    if (key.ctrl && char === "c") {
      if (permission) {
        resolvePermission("reject");
        return;
      }
      if (approval) {
        resolveApproval(false);
        return;
      }
      if (question) {
        question.resolve({ answer: t("ask.closed"), cancelled: true });
        setQuestion(null);
        return;
      }
      if (overlay) {
        setOverlay(null);
        return;
      }
      if (keyMode) {
        setKeyMode(false);
        resetInput();
        return;
      }
      // İş sürerken Ctrl+C her zaman iptal eder: seçim kopyalamak iptali
      // geciktirmemeli.
      if (busy) {
        clearSelectionDrag();
        cancelWork();
        return;
      }
      return;
    }

    if (permission) {
      const total = 3;
      if (key.leftArrow) {
        setPermission({ ...permission, choice: (permission.choice + total - 1) % total });
        return;
      }
      if (key.rightArrow || key.tab) {
        setPermission({ ...permission, choice: (permission.choice + 1) % total });
        return;
      }
      if (key.return) {
        resolvePermission((["once", "always", "reject"] as PermissionDecision[])[permission.choice]);
        return;
      }
      if (isEsc) {
        resolvePermission("reject");
        return;
      }
      const ch = (char ?? "").toLowerCase();
      if (ch === "o" || ch === "b") resolvePermission("once");
      else if (ch === "a" || ch === "h") resolvePermission("always");
      else if (ch === "r") resolvePermission("reject");
      return;
    }

    if (approval) {
      const ch = (char ?? "").toLowerCase();
      if (key.leftArrow || key.rightArrow || key.tab) {
        setApproval({ ...approval, allow: !approval.allow });
        return;
      }
      if (key.return) {
        resolveApproval(approval.allow);
        return;
      }
      if (isEsc || ch === "h" || ch === "n" || ch === "d") {
        resolveApproval(false);
        return;
      }
      if (ch === "e" || ch === "y" || ch === "a") {
        resolveApproval(true);
      }
      return;
    }

    if (question) {
      const total = question.options.length + 1;

      if (question.typing) {
        if (isEsc) {
          setQuestion({ ...question, typing: false });
          resetInput();
          return;
        }
        if (key.return) {
          const answer = inputText.trim();
          const resolve = question.resolve;
          setQuestion(null);
          resetInput();
          resolve({ answer: answer || t("ask.notAnswered") });
          return;
        }
        editInput(char, key);
        return;
      }

      if (key.upArrow) {
        setQuestion({ ...question, index: (question.index - 1 + total) % total });
        return;
      }
      if (key.downArrow) {
        setQuestion({ ...question, index: (question.index + 1) % total });
        return;
      }
      if (isEsc) {
        const resolve = question.resolve;
        setQuestion(null);
        resolve({ answer: t("ask.closed"), cancelled: true });
        return;
      }
      if (key.return || (char && /^[1-9]$/.test(char))) {
        const picked =
          char && /^[1-9]$/.test(char) ? Number(char) - 1 : question.index;
        if (picked >= question.options.length || picked < 0) {
          setQuestion({ ...question, typing: true, index: question.options.length });
          return;
        }
        const resolve = question.resolve;
        const chosen = question.options[picked];
        setQuestion(null);
        resolve({ answer: chosen?.label ?? String(chosen) });
        return;
      }
      return;
    }

    if (overlay) {
      const state = overlay;
      if (isEsc) {
        setOverlay(null);
        return;
      }
      if (key.return) {
        setOverlay(null);
        const selected = overlayList[state.index];
        if (selected) selectOverlay(state, selected);
        return;
      }
      if (key.upArrow) {
        setOverlay({ ...state, index: Math.max(0, state.index - 1) });
        return;
      }
      if (key.downArrow) {
        setOverlay({
          ...state,
          index: Math.min(Math.max(0, overlayList.length - 1), state.index + 1),
        });
        return;
      }
      if (key.backspace || key.delete) {
        setOverlay({ ...state, query: state.query.slice(0, -1), index: 0 });
        return;
      }
      if (char && !key.ctrl && !key.meta && !key.tab) {
        setOverlay({ ...state, query: state.query + char, index: 0 });
      }
      return;
    }

    if (keyMode) {
      if (isEsc) {
        setKeyMode(false);
        resetInput();
        return;
      }
      if (key.return) {
        const value = inputText;
        setKeyMode(false);
        resetInput();
        void applyKey(value);
        return;
      }
      editInput(char, key);
      return;
    }

    if (key.pageUp) {
      scrollBy(-(viewportHeight - 1));
      return;
    }
    if (key.pageDown) {
      scrollBy(viewportHeight - 1);
      return;
    }
    if (key.ctrl && char === "u") {
      scrollBy(-Math.floor(viewportHeight / 2));
      return;
    }
    if (key.ctrl && char === "d") {
      scrollBy(Math.floor(viewportHeight / 2));
      return;
    }
    if (key.ctrl && char === "p") {
      setOverlay({ kind: "palette", query: "", index: 0 });
      return;
    }
    if (isEsc) {
      // İş sürerken Esc her zaman iptal eder; seçim varsa o da birlikte
      // temizlenir (yoksa ilk Esc yalnızca seçimi silip iptali geciktirirdi).
      if (busy) {
        clearSelectionDrag();
        cancelWork();
        return;
      }
      if (selectionRef.current) {
        clearSelectionDrag();
        return;
      }
      if (slashOpen) {
        resetInput();
        return;
      }
      if (busy) cancelWork();
      return;
    }
    if (key.tab) {
      if (slashOpen && slashItems.length > 0) {
        const filled = `/${slashItems[slashActive].value}`;
        recall(filled);
        setSlashIndex(0);
        return;
      }
      if (!busy) toggleMode();
      return;
    }
    if (key.return) {
      if (slashOpen && slashItems.length > 0) {
        void handleSubmit(`/${slashItems[slashActive].value}`);
        return;
      }
      void handleSubmit(inputText);
      return;
    }
    if (slashOpen && slashItems.length > 0 && (key.upArrow || key.downArrow)) {
      if (key.upArrow) setSlashIndex(Math.max(0, slashActive - 1));
      else setSlashIndex(Math.min(slashItems.length - 1, slashActive + 1));
      return;
    }
    if (!busy && history.length > 0 && (key.upArrow || key.downArrow)) {
      if (key.upArrow) historyPrev();
      else historyNext();
      return;
    }

    editInput(char, key);
  });

  const disabled =
    Boolean(approval) ||
    Boolean(permission) ||
    Boolean(overlay) ||
    Boolean(question && !question.typing);
  const prefix = keyMode
    ? t("input.keyPrefix")
    : question?.typing
      ? t("input.answerPrefix")
      : undefined;

  return (
    <Box flexDirection="column" height={Math.max(10, rows - 1)} width={columns}>
      <Box
        flexGrow={1}
        flexShrink={1}
        overflow="hidden"
        flexDirection="column"
        paddingX={2}
        paddingTop={1}
      >
        {unsafeWorkspace ? (
          <Box marginBottom={1}>
            <Text color={theme.warn}>{t("notices.unsafeDir", { cwd: process.cwd() })}</Text>
          </Box>
        ) : null}
        {started ? (
          <Transcript
            lines={lines}
            offset={scrollOffset}
            height={viewportHeight}
            selection={selection}
            toast={toast}
            contentWidth={Math.max(10, columns - 4)}
          />
        ) : (
          <Home height={viewportHeight} />
        )}
      </Box>

      {overlay ? (
        <Menu
          items={overlayList}
          index={overlay.index}
          nameWidth={overlay.kind === "palette" ? 14 : 24}
          hint={t("menu.hint")}
        />
      ) : null}

      {approval ? <Approval command={approval.command} allow={approval.allow} /> : null}

      {permission ? (
        <Permission
          path={String(permission.path ?? "")}
          pattern={permission.pattern ?? ""}
          choice={permission.choice}
        />
      ) : null}

      {question ? (
        <Question
          question={question.question}
          options={question.options}
          index={question.index}
          typing={question.typing}
        />
      ) : null}

      {slashOpen ? <Menu items={slashItems} index={slashActive} nameWidth={14} /> : null}

      <Box flexDirection="column" flexShrink={0} paddingX={1}>
        <InputBar view={inputView} prefix={prefix} disabled={disabled} blinkOn={blink} />
        <StatusRow
          modelName={getModelInfo(modelId).name}
          mode={mode}
          autoApprove={autoApprove}
          premium={Boolean(account?.premium)}
        />
      </Box>

      <Box flexShrink={0} paddingX={2}>
        <Text color={theme.muted}>{"─".repeat(Math.max(10, columns - 4))}</Text>
      </Box>
      <Box flexShrink={0}>
        {busy ? (
          <WorkingIndicator />
        ) : (
          <BottomBar
            cwd={process.cwd()}
            tokens={tokens}
            credits={credits}
            contextWindow={contextWindow}
          />
        )}
      </Box>
    </Box>
  );
}
