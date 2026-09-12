import fs from "node:fs";
import path from "node:path";
import { CONFIG_DIR } from "./config.js";

const SESSIONS_DIR = path.join(CONFIG_DIR, "sessions");

function randomId() {
  return Math.random().toString(36).slice(2, 8);
}

export function createSession({ cwd, model }) {
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

export function saveSession(session) {
  if (!session?.id) return;
  try {
    fs.mkdirSync(SESSIONS_DIR, { recursive: true });
    session.updatedAt = Date.now();
    fs.writeFileSync(
      path.join(SESSIONS_DIR, `${session.id}.json`),
      JSON.stringify(session, null, 2),
      "utf8",
    );
  } catch {
    // sessizce geç — kayıt başarısız olsa da oturum devam etmeli
  }
}

export function loadSession(id) {
  try {
    const file = path.join(SESSIONS_DIR, `${id}.json`);
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

export function listSessions() {
  try {
    if (!fs.existsSync(SESSIONS_DIR)) return [];
    return fs
      .readdirSync(SESSIONS_DIR)
      .filter((name) => name.endsWith(".json"))
      .map((name) => {
        try {
          return JSON.parse(fs.readFileSync(path.join(SESSIONS_DIR, name), "utf8"));
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
  } catch {
    return [];
  }
}
