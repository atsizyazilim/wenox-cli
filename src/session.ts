import fs from "node:fs";
import path from "node:path";
import { configDir } from "./config.js";

// Sohbet geçmişi ve ekranda gösterilen satırlar. İkisi de oturum dosyasına
// yazılıp diskten okunuyor; okuma sırasında doğrulanmıyor (kendi yazdığımız
// dosyalar), bu yüzden alanlar opsiyonel.
export interface ChatMessage {
  role: string;
  content?: string | null;
  tool_calls?: unknown[];
  tool_call_id?: string;
  name?: string;
}

export type TranscriptRole =
  | "user"
  | "assistant"
  | "info"
  | "error"
  | "tool-call"
  | "tool-result";

// Transkript satırları ekranda okunurken bu alanlara erişiliyor (view.ts).
// Araç argümanları/sonuçları doğrulanmamış geldiği için hepsi opsiyonel.
export interface TranscriptMeta {
  durationMs?: number;
  thinkingMs?: number;
  modelName?: string;
}

export interface TranscriptToolArgs {
  path?: string;
  command?: string;
  query?: string;
  operation?: string;
  start_line?: number;
  end_line?: number;
}

export interface TranscriptToolResult {
  success?: boolean;
  error?: string;
  stdout?: string;
  stderr?: string;
  returncode?: number;
  diff?: string;
  answer?: string;
  count?: number;
  total_lines?: number;
  total_items?: number;
  match_count?: number;
}

export interface TranscriptItem {
  id: string;
  role: TranscriptRole;
  text?: string;
  meta?: TranscriptMeta | null;
  name?: string;
  args?: TranscriptToolArgs | null;
  result?: TranscriptToolResult | null;
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
