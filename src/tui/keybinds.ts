import type { Key } from "ink";

// Kısayollar tek yerde tanımlı: hem `/keys` ekranı buradan besleniyor hem de
// değiştirilebilir kısayollar (`config.keybinds`) bu adlarla eşleniyor.

export type KeybindId = "mode" | "palette" | "image" | "cancel" | "submit" | "history";

export interface KeybindSpec {
  id: KeybindId;
  default: string;
  // Bazı kısayollar değiştirilemez (Esc/Ctrl+C her durumda kaçış yolu).
  locked?: boolean;
}

export const KEYBINDS: KeybindSpec[] = [
  { id: "submit", default: "enter", locked: true },
  { id: "cancel", default: "esc", locked: true },
  { id: "mode", default: "tab" },
  { id: "palette", default: "ctrl+p" },
  { id: "image", default: "ctrl+v" },
  { id: "history", default: "up/down", locked: true },
];

export type KeybindMap = Record<KeybindId, string>;

export function defaultKeybinds(): KeybindMap {
  const map = {} as KeybindMap;
  for (const spec of KEYBINDS) map[spec.id] = spec.default;
  return map;
}

// config'ten gelen değerler doğrulanır; tanınmayan/kilitli olanlar varsayılanda kalır.
export function normalizeKeybinds(raw: unknown): KeybindMap {
  const map = defaultKeybinds();
  if (!raw || typeof raw !== "object") return map;
  const data = raw as Record<string, unknown>;
  for (const spec of KEYBINDS) {
    if (spec.locked) continue;
    const value = String(data[spec.id] ?? "").trim().toLowerCase();
    if (value) map[spec.id] = value;
  }
  return map;
}

interface ParsedBind {
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  name: string;
}

function parseBind(bind: string): ParsedBind | null {
  const parts = bind.split("+").map((part) => part.trim().toLowerCase());
  if (parts.length === 0 || !parts[parts.length - 1]) return null;
  const name = parts[parts.length - 1];
  const modifiers = new Set(parts.slice(0, -1));
  return {
    ctrl: modifiers.has("ctrl"),
    alt: modifiers.has("alt") || modifiers.has("meta"),
    shift: modifiers.has("shift"),
    name: name === "escape" ? "esc" : name,
  };
}

// Kısayol açıklamasındaki adları ink'in tuş adlarına çevirir.
const KEY_ALIASES: Record<string, string> = {
  esc: "escape",
  return: "enter",
  " ": "space",
  space: "space",
};

function currentName(char: string | undefined, key: Key): string {
  if (key.return) return "enter";
  if (key.escape) return "escape";
  if (key.tab) return "tab";
  if (key.backspace) return "backspace";
  if (key.delete) return "delete";
  if (/^[a-z0-9]$/i.test(char ?? "")) return String(char).toLowerCase();
  return String(char ?? "").toLowerCase();
}

export function matchesKey(bind: string, char: string | undefined, key: Key): boolean {
  const parsed = parseBind(bind);
  if (!parsed) return false;

  const wantName = KEY_ALIASES[parsed.name] ?? parsed.name;
  const name = currentName(char, key);
  const isModifierOnly = parsed.ctrl || parsed.alt;

  // Tek harf/rakam kısayolları kontrol/alt/shift ile birlikte gelmez; aksi
  // halde "p" kısayolu Ctrl+P'yi de yutar.
  if (!isModifierOnly) {
    if (key.ctrl || key.meta) return false;
  }
  if (parsed.ctrl !== Boolean(key.ctrl)) return false;
  if (parsed.alt !== Boolean(key.meta)) return false;

  return name === wantName;
}
