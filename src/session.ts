import fs from "node:fs";
import path from "node:path";
import { configDir } from "./config.js";
import { messagesTokenCount } from "./tokens.js";
import type { ContentPart } from "./images.js";
import type { ToolArgs, ToolResult } from "./tools.js";

// Sohbet geçmişi ve ekranda gösterilen satırlar. İkisi de oturum dosyasına
// yazılıp diskten okunuyor; okuma sırasında doğrulanmıyor (kendi yazdığımız
// dosyalar), bu yüzden alanlar opsiyonel.
export interface ChatMessage {
  role: string;
  // Görselli mesajlarda içerik parça dizisi olur (metin + image_url).
  content?: string | ContentPart[] | null;
  tool_calls?: unknown[];
  tool_call_id?: string;
  name?: string;
}

export type TranscriptRole =
  | "user"
  | "assistant"
  | "thinking"
  | "info"
  | "error"
  | "tool-call"
  | "tool-result";

// Transkript satırları ekranda okunurken bu alanlara erişiliyor (view.ts).
// Kimlik hem sıralı sayı (yeni satırlar) hem metin ("live") olabiliyor.
export type ItemId = string | number;

export interface TranscriptMeta {
  durationMs?: number;
  thinkingMs?: number;
  thinkingDurationMs?: number;
  modelName?: string;
  reasoning?: string;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    estimated?: boolean;
  };
}

export interface TranscriptItem {
  id: ItemId;
  role: TranscriptRole;
  text?: string;
  meta?: TranscriptMeta | null;
  name?: string;
  args?: ToolArgs | null;
  result?: ToolResult | null;
  queued?: boolean;
  expanded?: boolean;
  live?: boolean;
}

export interface Session {
  id: string;
  title: string;
  cwd: string;
  model: string;
  tokens: number;
  // Oturum boyunca harcanan toplam token (istatistikler için).
  usedTokens?: number;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
  items: TranscriptItem[];
}

function sessionsDir(): string {
  return path.join(configDir(), "sessions");
}

function randomId(): string {
  return Math.random().toString(36).slice(2, 8);
}

// Eski oturumlarda `tokens` yanlışlıkla turların TOPLAMI olarak yazılmıştı;
// bağlam göstergesini düzeltmek için mesajlardan gerçek tokenizer ile sayılıyor.
export function estimateContextTokens(messages: ChatMessage[] | null | undefined): number {
  if (!Array.isArray(messages)) return 0;
  return messagesTokenCount(
    messages.map((message) => ({ content: messageText(message) })),
  );
}

export function createSession({ cwd, model }: { cwd: string; model: string }): Session {
  const now = Date.now();
  return {
    id: `ses_${now.toString(36)}${randomId()}`,
    title: "",
    cwd,
    model,
    tokens: 0,
    createdAt: now,
    updatedAt: now,
    messages: [],
    items: [],
  };
}

export function saveSession(session: Session | null | undefined): void {
  if (!session?.id) return;
  try {
    const dir = sessionsDir();
    fs.mkdirSync(dir, { recursive: true });
    session.updatedAt = Date.now();
    fs.writeFileSync(
      path.join(dir, `${session.id}.json`),
      JSON.stringify(session, null, 2),
      "utf8",
    );
  } catch {
    // sessizce geç — kayıt başarısız olsa da oturum devam etmeli
  }
}

export function loadSession(id: string): Session | null {
  try {
    const file = path.join(sessionsDir(), `${id}.json`);
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf8")) as Session;
  } catch {
    return null;
  }
}

export function deleteSession(id: string): boolean {
  try {
    const file = path.join(sessionsDir(), `${id}.json`);
    if (!fs.existsSync(file)) return false;
    fs.rmSync(file, { force: true });
    return true;
  } catch {
    return false;
  }
}

export function listSessions(): Session[] {
  try {
    const dir = sessionsDir();
    if (!fs.existsSync(dir)) return [];
    return fs
      .readdirSync(dir)
      .filter((name) => name.endsWith(".json"))
      .map((name): Session | null => {
        try {
          return JSON.parse(fs.readFileSync(path.join(dir, name), "utf8")) as Session;
        } catch {
          return null;
        }
      })
      .filter((item): item is Session => item !== null)
      .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
  } catch {
    return [];
  }
}
