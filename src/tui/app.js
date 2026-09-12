import fs from "node:fs";
import { html } from "htm/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Box, Text, useApp, useInput, useStdout } from "ink";
import { AVAILABLE_MODELS, CONTEXT_WINDOW, getModelInfo, saveConfig } from "../config.js";
import { getSystemPrompt } from "../agent.js";
import { listSessions, saveSession } from "../session.js";
import { fetchAccount, formatAccount, verifyApiKey } from "../account.js";
import { copyToClipboard } from "../clipboard.js";
import { plain, sliceByWidth } from "../utils.js";
import { t, setLocale, getLocale, localeTag, LANGUAGES } from "../i18n/index.js";
import { requestCancel } from "../cancel.js";
import { useBlink } from "./hooks.js";
import { theme } from "./theme.js";
import { setTitle, parseMouse } from "./screen.js";
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
import { Home } from "./screens/home.js";
import { Transcript } from "./components/transcript.js";
import { InputBar } from "./components/input-bar.js";
import { WorkingIndicator } from "./components/working.js";
import { StatusRow, BottomBar } from "./components/status-bar.js";
import { Approval } from "./components/approval.js";
import { Permission } from "./components/permission.js";
import { Question } from "./components/question.js";
import { Menu } from "./components/menu.js";

const MODEL_ITEMS = Object.values(AVAILABLE_MODELS).map((model) => ({
  value: model.id,
  left: model.name,
  right: model.id,
}));

const LANG_ITEMS = LANGUAGES.map((lang) => ({
  value: lang.code,
  left: lang.label,
  right: lang.code,
}));

function commandItems() {
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

const TRANSCRIPT_TOP = 2; // transkriptin ilk satırının ekran satırı (1 tabanlı)
const TRANSCRIPT_LEFT = 3; // transkriptin ilk kolonunun ekran kolonu (1 tabanlı)
const AUTO_COMPACT_RATIO = 0.85;

function computeCost(pricing, usage) {
  if (!pricing || typeof pricing !== "object") return null;
  const inRate = pricing.input_per_million ?? pricing.prompt ?? null;
  const outRate = pricing.output_per_million ?? pricing.completion ?? null;
  if (inRate == null && outRate == null) return null;
  return (usage.prompt / 1e6) * (inRate ?? 0) + (usage.completion / 1e6) * (outRate ?? 0);
}

function normalizeSelection(selection) {
  const { startLine, startCol, endLine, endCol } = selection;
  if (startLine < endLine || (startLine === endLine && startCol <= endCol)) {
    return { startLine, startCol, endLine, endCol };
  }
  return { startLine: endLine, startCol: endCol, endLine: startLine, endCol: startCol };
}

function rebuildItems(messages) {
  const out = [];
  let id = 0;
  for (const message of messages) {
    if (message.role === "user" && typeof message.content === "string" && message.content.trim()) {
      out.push({ id: (id += 1), role: "user", text: message.content });
    } else if (message.role === "assistant" && typeof message.content === "string" && message.content.trim()) {
      out.push({ id: (id += 1), role: "assistant", text: message.content, meta: { modelName: "" } });
    }
  }
  return out;
}

function filterBy(items, query) {
  if (!query) return items;
  const q = query.toLowerCase();
  return items.filter((item) =>
    `${item.left} ${item.right} ${item.value}`.toLowerCase().includes(q),
  );
}

export function App({ agent, version, initialModelId, initialAutoApprove = false, session }) {
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

  const [items, setItems] = useState(initialItems);
  const [liveText, setLiveText] = useState("");
  const [busy, setBusy] = useState(false);
  const [inputTokens, setInputTokens] = useState([]);
  const [caret, setCaret] = useState({ i: 0, o: 0 });
  const [slashIndex, setSlashIndex] = useState(0);
  const [started, setStarted] = useState(initialItems.length > 0);
  const [sessionName, setSessionName] = useState("WenOX");
  const [sessionTitle, setSessionTitle] = useState(session?.title ?? "");
  const [account, setAccount] = useState(null);
  const [credits, setCredits] = useState(null);
  const [remoteModels, setRemoteModels] = useState(null);
  const [modelMeta, setModelMeta] = useState({});
  const [selection, setSelection] = useState(null);
  const [toast, setToast] = useState(null);
  const [lang, setLang] = useState(getLocale());
  const [mode, setMode] = useState(agent.mode ?? "plan");
  const [modelId, setModelId] = useState(initialModelId);
  const [autoApprove, setAutoApprove] = useState(initialAutoApprove);
  const [overlay, setOverlay] = useState(null);
  const [approval, setApproval] = useState(null);
  const [permission, setPermission] = useState(null);
  const [question, setQuestion] = useState(null);
  const [keyMode, setKeyMode] = useState(false);
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [tokens, setTokens] = useState(session?.tokens ?? 0);
  const selectionRef = useRef(null);
  const draggingRef = useRef(false);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [follow, setFollow] = useState(true);
  const offsetRef = useRef(0);
  const maxOffsetRef = useRef(0);

  const idRef = useRef(initialItems.length);
  const itemsRef = useRef(initialItems);
  const queuedRef = useRef([]);
  const drivingRef = useRef(false);
  const busyRef = useRef(false);
  const tokensRef = useRef(session?.tokens ?? 0);
  const usageRef = useRef({ prompt: 0, completion: 0 });
  const contextWindowRef = useRef(CONTEXT_WINDOW);
  const warnedRef = useRef(false);
  const push = useCallback((item) => {
    idRef.current += 1;
    const id = idRef.current;
    itemsRef.current = [...itemsRef.current, { ...item, id }];
    setItems(itemsRef.current);
  }, []);

  const loadRemoteModels = useCallback(async () => {
    try {
      const page = await agent.client.models.list();
      const list = Array.isArray(page?.data) ? page.data : [];
      if (list.length === 0) return null;

      const metas = {};
      const items = list.map((model) => {
        const id = model?.id ?? String(model);
        const name = model?.name && model.name !== id ? model.name : id;
        const extras = [];
        if (name !== id) extras.push(id);
        if (model?.context_window) extras.push(t("models.contextWindow", { k: Math.round(model.context_window / 1000) }));
        if (model?.owned_by) extras.push(model.owned_by);
        metas[id] = {
          contextWindow: Number(model?.context_window) || null,
          pricing: model?.pricing ?? null,
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
    (loaded) => {
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

      let restored = (loaded.items ?? []).map((entry, index) => ({ ...entry, id: index + 1 }));
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
    },
    [agent, push, session],
  );

  const sink = useMemo(
    () => ({
      thinking: () => {
        setBusy(true);
        busyRef.current = true;
      },
      assistantUpdate: (text) => {
        setLiveText(text);
      },
      assistantEnd: (text, meta) => {
        setLiveText("");
        if (meta?.usage?.total_tokens) {
          tokensRef.current += meta.usage.total_tokens;
          usageRef.current.prompt += meta.usage.prompt_tokens ?? 0;
          usageRef.current.completion += meta.usage.completion_tokens ?? 0;
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
        if (text && text.trim()) push({ role: "assistant", text, meta });
      },
      assistantClear: () => {
        setLiveText("");
      },
      toolCall: (name, args) => {
        setLiveText("");
        push({ role: "tool-call", name, args });
      },
      toolResult: (name, result) => push({ role: "tool-result", name, result }),
      info: (text) => push({ role: "info", text }),
      error: (text) => {
        setLiveText("");
        push({ role: "error", text });
      },
      askApproval: (command) =>
        new Promise((resolve) => {
          setApproval({ command, resolve, allow: true });
        }),
      askPermission: ({ tool, path: target, resolved, grant, pattern }) =>
        new Promise((resolve) => {
          setPermission({ tool, path: target, resolved, grant, pattern, choice: 0, resolve });
        }),
      askUser: ({ question: promptText, options }) =>
        new Promise((resolve) => {
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
    async (raw) => {
      const [cmd, ...rest] = raw.slice(1).split(/\s+/);
      const arg = rest.join(" ");
      switch ((cmd ?? "").toLowerCase()) {
        case "exit":
        case "quit":
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
            push({ role: "error", text: t("compact.failed", { message: error.message }) });
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
              right: `${new Date(item.updatedAt ?? Date.now()).toLocaleString(localeTag())}  ·  ${item.cwd ?? ""}`,
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
          push({ role: "error", text: t("notices.unknownCommand", { cmd }) });
      }
    },
    [agent, autoApprove, exit, modelId, push],
  );

  const applyKey = useCallback(
    async (value) => {
      const key = value.trim();
      if (!key) return;
      push({ role: "info", text: t("onboarding.verifying") });
      const result = await verifyApiKey(key);
      if (!result.ok) {
        const reason = result.reason === "network" ? "onboarding.network" : "onboarding.invalid";
        push({ role: "error", text: t(reason) });
        return;
      }
      agent.setApiKey(key);
      saveConfig({ apiKey: key });
      if (result.account) {
        setAccount(result.account);
        if (typeof result.account.credits_remaining === "number") setCredits(result.account.credits_remaining);
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

  const drive = useCallback(async () => {
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
          push({ role: "error", text: t("notices.errorPrefix", { message: error.message }) });
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
      maybeTitle();
      refreshAccount();
    }
  }, [agent, maybeTitle, push, refreshAccount, sink, syncSession]);

  const handleSubmit = useCallback(
    async (raw) => {
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

  const resolveApproval = (allowed) => {
    if (!approval) return;
    approval.resolve(allowed);
    setApproval(null);
    if (!allowed) push({ role: "info", text: t("notices.commandRejected") });
  };

  const resolvePermission = (decision) => {
    const resolve = permission?.resolve;
    setPermission(null);
    resolve?.(decision);
  };

  const selectModel = (value) => {
    agent.setModel(value);
    setModelId(value);
    saveConfig({ currentModel: value });
    push({ role: "info", text: t("notices.modelSelected", { name: getModelInfo(value).name }) });
  };

  const selectLanguage = (code) => {
    setLocale(code);
    setLang(code);
    saveConfig({ language: code });
    const name = LANGUAGES.find((entry) => entry.code === code)?.label ?? code;
    push({ role: "info", text: t("lang.selected", { name }) });
  };

  const toggleMode = () => {
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
  }, [items, liveText, modelId]);

  const lines = useMemo(() => buildTranscript(displayItems, width), [displayItems, width, lang]);

  const commands = useMemo(() => commandItems(), [lang]);

  const activeMeta = modelMeta[modelId] ?? {};
  const contextWindow = activeMeta.contextWindow || CONTEXT_WINDOW;
  contextWindowRef.current = contextWindow;
  const sessionCost = computeCost(activeMeta.pricing, usageRef.current);

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
  if (question) extraRows += (question.options.length + 1) * 2 + 4;

  const viewportHeight = Math.max(4, rows - 7 - inputView.lines.length - extraRows);
  const maxOffset = Math.max(0, lines.length - viewportHeight);
  maxOffsetRef.current = maxOffset;

  useEffect(() => {
    const next = follow ? maxOffset : Math.min(offsetRef.current, maxOffset);
    offsetRef.current = next;
    setScrollOffset(next);
  }, [maxOffset, follow]);

  useEffect(() => {
    refreshAccount();
  }, [refreshAccount]);

  useEffect(() => {
    loadRemoteModels();
  }, [loadRemoteModels]);

  useEffect(() => {
    const name = sessionTitle || sessionName;
    setTitle(started ? `WenOX CLI | ${name}` : "WenOX CLI");
  }, [started, sessionName, sessionTitle]);

  const setSel = (value) => {
    selectionRef.current = value;
    setSelection(value);
  };

  const toTranscriptPos = (x, y, clamp = false) => {
    if (!started || lines.length === 0) return null;
    const rel = y - TRANSCRIPT_TOP;
    if (!clamp && (rel < 0 || rel >= viewportHeight)) return null;
    const clamped = Math.max(0, Math.min(viewportHeight - 1, rel));
    return {
      line: Math.max(0, Math.min(lines.length - 1, scrollOffset + clamped)),
      col: Math.max(0, x - TRANSCRIPT_LEFT),
    };
  };

  const selectionText = (sel) => {
    const { startLine, startCol, endLine, endCol } = normalizeSelection(sel);
    const out = [];
    for (let i = startLine; i <= endLine; i += 1) {
      const line = lines[i] ?? "";
      if (i === startLine && i === endLine) out.push(sliceByWidth(line, startCol, endCol));
      else if (i === startLine) out.push(sliceByWidth(line, startCol, Number.MAX_SAFE_INTEGER));
      else if (i === endLine) out.push(sliceByWidth(line, 0, endCol));
      else out.push(plain(line));
    }
    return out
      .map((line) => line.replace(/^\s*│ ?/, "").replace(/[ \t]+$/, ""))
      .filter((line) => !/^(▣ Build|✎|❓|\+ (Düşünen|Thinking):|→ (Soru soruldu|Question asked))/.test(line.trim()))
      .join("\n");
  };

  const cleanCopy = (text) =>
    text
      .replace(/[ \t]+$/gm, "")
      .replace(/\n{2,}/g, "\n")
      .replace(/^\n+|\n+$/g, "");

  const copySelection = () => {
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

  const scrollBy = (delta) => {
    const next = Math.max(0, Math.min(maxOffsetRef.current, offsetRef.current + delta));
    offsetRef.current = next;
    setScrollOffset(next);
    setFollow(next >= maxOffsetRef.current);
  };

  const selectOverlay = (state, selected) => {
    if (state.kind === "palette") {
      handleSubmit(`/${selected.value}`);
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

  const editInput = (char, key) => {
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
      const lines = char.split("\n").length;
      if (lines > 2 || char.length > 120) {
        const next = insertPaste(inputTokens, caret, char, lines);
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

  const recall = (text) => {
    const restored = createTokens(text);
    setInputTokens(restored);
    setCaret(endCursor(restored));
  };

  const historyPrev = () => {
    if (history.length === 0) return;
    const next = historyIndex <= 0 ? history.length - 1 : historyIndex - 1;
    setHistoryIndex(next);
    recall(history[next]);
  };

  const historyNext = () => {
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
        if (pos) {
          draggingRef.current = true;
          setSel({ startLine: pos.line, startCol: pos.col, endLine: pos.line, endCol: pos.col });
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
        draggingRef.current = false;
        return;
      }
      return;
    }
    if (/^\[M/.test(char ?? "")) return;

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
        resolvePermission(["once", "always", "reject"][permission.choice]);
        return;
      }
      if (key.escape) {
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
      if (key.escape || ch === "h" || ch === "n" || ch === "d") {
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
        if (key.escape) {
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
      if (key.escape) {
        const resolve = question.resolve;
        setQuestion(null);
        resolve({ answer: t("ask.closed"), cancelled: true });
        return;
      }
      if (key.return || (char && /^[1-9]$/.test(char))) {
        const picked = char && /^[1-9]$/.test(char) ? Number(char) - 1 : question.index;
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
      if (key.escape) {
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
      if (key.escape) {
        setKeyMode(false);
        resetInput();
        return;
      }
      if (key.return) {
        const value = inputText;
        setKeyMode(false);
        resetInput();
        applyKey(value);
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
    if (key.ctrl && char === "c") {
      if (copySelection()) return;
      if (busy) requestCancel();
      else exit();
      return;
    }
    if (key.escape) {
      if (selectionRef.current) {
        setSel(null);
        return;
      }
      if (slashOpen) {
        resetInput();
        return;
      }
      if (busy) requestCancel();
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
        handleSubmit(`/${slashItems[slashActive].value}`);
        return;
      }
      handleSubmit(inputText);
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

  const disabled = Boolean(approval) || Boolean(permission) || Boolean(overlay) || Boolean(question && !question.typing);
  const prefix = keyMode ? t("input.keyPrefix") : question?.typing ? t("input.answerPrefix") : undefined;

  return html`
    <${Box} flexDirection="column" height=${rows} width=${columns}>
      <${Box} flexGrow=${1} flexDirection="column" paddingX=${2} paddingTop=${1}>
        ${started
          ? html`<${Transcript}
              lines=${lines}
              offset=${scrollOffset}
              height=${viewportHeight}
              selection=${selection}
              toast=${toast}
              contentWidth=${Math.max(10, columns - 4)}
            />`
          : html`<${Home} height=${viewportHeight} />`}
      <//>

      ${overlay
        ? html`<${Menu}
            items=${overlayList}
            index=${overlay.index}
            nameWidth=${overlay.kind === "palette" ? 14 : 24}
            hint=${t("menu.hint")}
          />`
        : null}

      ${approval
        ? html`<${Approval} command=${approval.command} allow=${approval.allow} />`
        : null}

      ${permission
        ? html`<${Permission} path=${permission.path} pattern=${permission.pattern} choice=${permission.choice} />`
        : null}

      ${question
        ? html`<${Question}
            question=${question.question}
            options=${question.options}
            index=${question.index}
            typing=${question.typing}
          />`
        : null}

      ${slashOpen ? html`<${Menu} items=${slashItems} index=${slashActive} nameWidth=${14} />` : null}

      <${Box} paddingX=${1} flexDirection="column">
        <${InputBar} view=${inputView} prefix=${prefix} disabled=${disabled} blinkOn=${blink} />
        <${StatusRow}
          modelName=${getModelInfo(modelId).name}
          mode=${mode}
          autoApprove=${autoApprove}
          premium=${Boolean(account?.premium)}
        />
      <//>

      <${Box} paddingX=${2}>
        <${Text} color=${theme.muted}>${"─".repeat(Math.max(10, columns - 4))}<//>
      <//>
      ${busy
        ? html`<${WorkingIndicator} />`
        : html`<${BottomBar}
            cwd=${process.cwd()}
            tokens=${tokens}
            credits=${credits}
            contextWindow=${contextWindow}
            cost=${sessionCost}
          />`}
    <//>
  `;
}
