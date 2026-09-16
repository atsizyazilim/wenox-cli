import { html } from "htm/react";
import { useEffect, useState } from "react";
import { Box, Text } from "ink";
import { theme } from "../theme.js";
import { t } from "../../i18n/index.js";

const CELLS = 12;
const TICK_MS = 90;
const SHADES = ["#eaf2ff", "#9dc0ff", "#5f87ff", "#31508f", "#1e2a44"];

export function WorkingIndicator({ hint = t("working.cancel") }: { hint?: string }) {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setFrame((value) => value + 1), TICK_MS);
    return () => clearInterval(timer);
  }, []);

  const head = frame % CELLS;

  return html`
    <${Box} paddingX=${2} width="100%">
      <${Text}>
        ${Array.from({ length: CELLS }, (_, i) => {
          const distance = (head - i + CELLS) % CELLS;
          const color = SHADES[Math.min(distance, SHADES.length - 1)];
          return html`<${Text} key=${i} color=${color}>${"▪"}<//>`;
        })}
      <//>
      <${Text} color=${theme.muted}>${"   ·   "}<//>
      <${Text} bold color=${theme.warn}>${"esc"}<//>
      <${Text} color=${theme.muted}>${`  ${hint}`}<//>
    <//>
  `;
}
