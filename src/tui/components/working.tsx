import { useEffect, useState } from "react";
import { Box, Text } from "ink";
import { theme } from "../theme.js";
import { t } from "../../i18n/index.js";

const CELLS = 12;
const TICK_MS = 90;
const SHADES = ["#eaf2ff", "#9dc0ff", "#5f87ff", "#31508f", "#1e2a44"];

export function WorkingIndicator({
  hint = t("working.cancel"),
  startedAt,
}: {
  hint?: string;
  // Tur başlangıcı: geçen süre gösterilir, "dondu mu çalışıyor mu" belirsizliği kalksın.
  startedAt?: number | null;
}) {
  const [frame, setFrame] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setFrame((value) => value + 1), TICK_MS);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const head = frame % CELLS;
  const elapsed = startedAt ? Math.max(0, Math.floor((now - startedAt) / 1000)) : null;
  const elapsedText =
    elapsed === null
      ? ""
      : elapsed < 60
        ? `${elapsed}s`
        : `${Math.floor(elapsed / 60)}m ${String(elapsed % 60).padStart(2, "0")}s`;

  return (
    <Box paddingX={2} width="100%">
      <Text>
        {Array.from({ length: CELLS }, (_, i) => {
          const distance = (head - i + CELLS) % CELLS;
          const color = SHADES[Math.min(distance, SHADES.length - 1)];
          return (
            <Text key={i} color={color}>
              {"▪"}
            </Text>
          );
        })}
      </Text>
      <Text color={theme.muted}>{"   ·   "}</Text>
      <Text bold color={theme.warn}>
        {"esc"}
      </Text>
      <Text color={theme.muted}>{`  ${hint}`}</Text>
      {elapsedText ? <Text color={theme.muted}>{`   ·   ${elapsedText}`}</Text> : null}
    </Box>
  );
}
