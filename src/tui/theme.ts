// Renk paleti. `theme` dışa aktarılan TEK nesne: tema değişince içeriği
// güncellenir, böylece onu okuyan bileşenlerin değişmesi gerekmez.

export interface Theme {
  name: string;
  accent: string;
  accentBright: string;
  ok: string;
  warn: string;
  err: string;
  user: string;
  muted: string;
  border: string;
  borderActive: string;
  borderErr: string;
  inputBg: string;
  userAccent: string;
  userBlockBg: string;
  menuSelectedBg: string;
  menuSelectedFg: string;
  menuText: string;
  menuDesc: string;
  questionBar: string;
  questionLink: string;
  selectionBg: string;
  selectionFg: string;
  toastBg: string;
  toastBar: string;
  toastFg: string;
}

export const THEMES: Record<string, Theme> = {
  wenox: {
    name: "wenox",
    accent: "cyan",
    accentBright: "cyanBright",
    ok: "green",
    warn: "yellow",
    err: "red",
    user: "blue",
    muted: "gray",
    border: "cyan",
    borderActive: "green",
    borderErr: "red",
    inputBg: "#1e1e1e",
    userAccent: "#5f87ff",
    userBlockBg: "#1c1c1c",
    menuSelectedBg: "#e0a065",
    menuSelectedFg: "black",
    menuText: "white",
    menuDesc: "#9aa0a6",
    questionBar: "#c678dd",
    questionLink: "#61afef",
    selectionBg: "#cfcfcf",
    selectionFg: "#111111",
    toastBg: "#262626",
    toastBar: "#4aa8c0",
    toastFg: "#ffffff",
  },
  midnight: {
    name: "midnight",
    accent: "#6ea8fe",
    accentBright: "#9ec5ff",
    ok: "#5abf8a",
    warn: "#e5c07b",
    err: "#e06c75",
    user: "#6ea8fe",
    muted: "#7f8a99",
    border: "#4a5a73",
    borderActive: "#6ea8fe",
    borderErr: "#e06c75",
    inputBg: "#151a21",
    userAccent: "#6ea8fe",
    userBlockBg: "#171d26",
    menuSelectedBg: "#2d5f9a",
    menuSelectedFg: "#eaf2ff",
    menuText: "#dce3ea",
    menuDesc: "#8b98a8",
    questionBar: "#b48ead",
    questionLink: "#88c0d0",
    selectionBg: "#3b4a5f",
    selectionFg: "#eef4fb",
    toastBg: "#1d242e",
    toastBar: "#6ea8fe",
    toastFg: "#eaf2ff",
  },
  forest: {
    name: "forest",
    accent: "#7fc98a",
    accentBright: "#a3e0ac",
    ok: "#7fc98a",
    warn: "#d9c26a",
    err: "#e07a5f",
    user: "#8fd6a4",
    muted: "#7c8b7f",
    border: "#4d6350",
    borderActive: "#7fc98a",
    borderErr: "#e07a5f",
    inputBg: "#161d18",
    userAccent: "#6fbf8b",
    userBlockBg: "#182019",
    menuSelectedBg: "#2f6b46",
    menuSelectedFg: "#eaf7ee",
    menuText: "#dbe7dd",
    menuDesc: "#8aa08e",
    questionBar: "#c2a26b",
    questionLink: "#88b4a0",
    selectionBg: "#3c5a43",
    selectionFg: "#eef7f0",
    toastBg: "#1d2620",
    toastBar: "#7fc98a",
    toastFg: "#eaf7ee",
  },
  amber: {
    name: "amber",
    accent: "#e0a065",
    accentBright: "#f2bd88",
    ok: "#a8c07a",
    warn: "#e0a065",
    err: "#e06c5f",
    user: "#e0a065",
    muted: "#8c8378",
    border: "#6b5847",
    borderActive: "#e0a065",
    borderErr: "#e06c5f",
    inputBg: "#1f1a15",
    userAccent: "#e0a065",
    userBlockBg: "#221c16",
    menuSelectedBg: "#8a5a2b",
    menuSelectedFg: "#fff3e6",
    menuText: "#ece2d6",
    menuDesc: "#a3968a",
    questionBar: "#d08aa6",
    questionLink: "#8fb6c9",
    selectionBg: "#5c4632",
    selectionFg: "#fff6ec",
    toastBg: "#262019",
    toastBar: "#e0a065",
    toastFg: "#fff3e6",
  },
  mono: {
    name: "mono",
    accent: "#c8c8c8",
    accentBright: "#f0f0f0",
    ok: "#c8c8c8",
    warn: "#a8a8a8",
    err: "#b0b0b0",
    user: "#c8c8c8",
    muted: "#808080",
    border: "#5a5a5a",
    borderActive: "#c8c8c8",
    borderErr: "#b0b0b0",
    inputBg: "#1a1a1a",
    userAccent: "#a0a0a0",
    userBlockBg: "#1d1d1d",
    menuSelectedBg: "#4a4a4a",
    menuSelectedFg: "#f5f5f5",
    menuText: "#e0e0e0",
    menuDesc: "#909090",
    questionBar: "#b0b0b0",
    questionLink: "#c8c8c8",
    selectionBg: "#585858",
    selectionFg: "#f5f5f5",
    toastBg: "#242424",
    toastBar: "#a8a8a8",
    toastFg: "#f0f0f0",
  },
};

export const DEFAULT_THEME = "wenox";

export const theme: Theme = { ...THEMES[DEFAULT_THEME] };

export function themeNames(): string[] {
  return Object.keys(THEMES);
}

// Tanınmayan ad sessizce varsayılana düşer (config elle bozulmuş olabilir).
export function applyTheme(name: string | null | undefined): string {
  const key = String(name ?? "").trim();
  const next = THEMES[key] ?? THEMES[DEFAULT_THEME];
  Object.assign(theme, next);
  return next.name;
}
