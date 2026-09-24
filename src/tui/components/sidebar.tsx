import { Box, Text } from "ink";
import stringWidth from "string-width";
import { theme } from "../theme.js";
import { t } from "../../i18n/index.js";
import { resetLabel } from "../../account.js";
import type { AccountInfo } from "../../account.js";
import { formatTokens } from "../view.js";
import type { TodoItem } from "../../session.js";

// Geniş terminallerde sağda duran özet panel: bağlam doluluğu, görev listesi ve
// bu oturumda değişen dosyalar. Dar terminallerde hiç çizilmez.

// Kenar çubuğu yalnızca geniş terminallerde açılır. Panel dar tutuluyor ki
// transkripte yeterli yer kalsın; eşik config'ten değiştirilebilir.
export const SIDEBAR_WIDTH = 34;
export const DEFAULT_SIDEBAR_MIN_COLUMNS = 130;

export function sidebarWidthFor(
  columns: number,
  minColumns = DEFAULT_SIDEBAR_MIN_COLUMNS,
): number {
  return columns >= minColumns ? SIDEBAR_WIDTH : 0;
}

export interface ChangedFile {
  path: string;
  added: number;
  removed: number;
}

function section(title: string, rows: string[]): string[] {
  return [title, ...rows, ""];
}

function fit(text: string, width: number): string {
  if (stringWidth(text) <= width) return text;
  let out = "";
  for (const char of text) {
    if (stringWidth(out + char) > width - 1) break;
    out += char;
  }
  return `${out}…`;
}

export function Sidebar({
  width,
  tokens,
  contextWindow,
  todos,
  files,
  usage = null,
}: {
  width: number;
  tokens: number;
  contextWindow: number;
  todos: TodoItem[];
  files: ChangedFile[];
  usage?: AccountInfo["usage_limits"] | null;
}) {
  // Kenar çubuğunda border (1) + paddingX (1+1) var; metin alanı bu kadar.
  const inner = Math.max(8, width - 4);
  const pct = contextWindow > 0 ? Math.min(100, Math.round((tokens / contextWindow) * 100)) : 0;
  const filled = Math.round((pct / 100) * inner);
  const bar = `${"█".repeat(filled)}${"░".repeat(Math.max(0, inner - filled))}`;

  const lines: string[] = [];
  lines.push(
    ...section(t("sidebar.context"), [
      `${bar}`,
      `${pct}%  ·  ${formatTokens(tokens)} / ${formatTokens(contextWindow)}`,
    ]),
  );

  if (todos.length > 0) {
    const done = todos.filter((todo) => todo.status === "completed").length;
    // Panelde liste dökülmüyor: yalnızca şu an yapılan iş (ve varsa sıradaki).
    const active = todos.filter((todo) => todo.status !== "completed").slice(0, 3);
    const rows = active.map((todo) => {
      const mark = todo.status === "in_progress" ? "▸" : "○";
      return `${mark} ${fit(todo.content, inner - 2)}`;
    });
    if (rows.length === 0) rows.push(`✓ ${t("sidebar.allDone")}`);
    lines.push(...section(`${t("sidebar.tasks")} (${done}/${todos.length})`, rows));
  }

  // Limit pencereleri (5 saat / haftalık / aylık) /v1/me'den gelir ve alt barda
  // da görünür; burada yenilenmeye kalan süreyle birlikte üçü birden duruyor.
  if (usage) {
    const rows = (
      [
        [t("account.window5h"), usage.five_hour],
        [t("account.windowWeekly"), usage.weekly],
        [t("account.windowMonthly"), usage.monthly],
      ] as const
    )
      .map(([label, window]) => {
        if (!window || typeof window.used_percent !== "number") return null;
        const name = label.replace(/:\s*$/, "").trim();
        const percent = `${window.used_percent.toFixed(1)}%`;
        const reset = resetLabel(window);
        return fit(reset ? `${name} ${percent} · ${reset}` : `${name} ${percent}`, inner);
      })
      .filter((row): row is string => row !== null);
    if (rows.length > 0) lines.push(...section(t("sidebar.limits"), rows));
  }

  if (files.length > 0) {
    const rows = files.slice(0, 6).map((file) => {
      const stats = `${file.added > 0 ? `+${file.added}` : ""}${file.removed > 0 ? `-${file.removed}` : ""}`;
      return `${fit(file.path, inner - stats.length - 1)} ${stats}`;
    });
    if (files.length > 6) rows.push(`+${files.length - 6}`);
    lines.push(...section(t("sidebar.files"), rows));
  }

  return (
    <Box
      width={width}
      flexDirection="column"
      flexShrink={0}
      paddingX={1}
      borderStyle="single"
      borderTop={false}
      borderBottom={false}
      borderRight={false}
      borderColor={theme.border}
    >
      {lines.map((line, index) => {
        const isTitle = line.startsWith(t("sidebar.")) || /\((\d+)\/\d+\)$/.test(line);
        return (
          <Text key={index} color={isTitle ? theme.accent : theme.muted} wrap="truncate">
            {line}
          </Text>
        );
      })}
    </Box>
  );
}
