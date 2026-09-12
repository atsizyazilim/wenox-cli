import fs from "node:fs";
import path from "node:path";
import { configDir } from "./config.js";

const STORE_VERSION = 1;

function permissionsFile() {
  return path.join(configDir(), "permissions.json");
}

function readStore() {
  const empty = { version: STORE_VERSION, projects: {} };
  try {
    const file = permissionsFile();
    if (!fs.existsSync(file)) return empty;
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!data || typeof data.projects !== "object" || data.projects === null) return empty;
    return { version: STORE_VERSION, projects: data.projects };
  } catch {
    return empty;
  }
}

function writeStore(store) {
  try {
    fs.mkdirSync(configDir(), { recursive: true, mode: 0o700 });
    fs.writeFileSync(permissionsFile(), `${JSON.stringify(store, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
  } catch {
    // kayıt başarısız olsa da oturum devam etmeli
  }
}

export function loadGrants(projectRoot) {
  if (!projectRoot) return [];
  const list = readStore().projects[projectRoot];
  return Array.isArray(list) ? list.filter((entry) => typeof entry === "string") : [];
}

export function addGrant(projectRoot, dir) {
  if (!projectRoot || !dir) return;
  const store = readStore();
  const granted = new Set(store.projects[projectRoot] ?? []);
  granted.add(dir);
  store.projects[projectRoot] = [...granted];
  writeStore(store);
}
