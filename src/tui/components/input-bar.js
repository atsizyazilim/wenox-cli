import { html } from "htm/react";
import { Box, Text } from "ink";
import { PromptLine } from "./prompt-line.js";
import { theme } from "../theme.js";

export function InputBar({ view, prefix, disabled, blinkOn }) {
  const markerColor = disabled ? theme.muted : theme.accentBright;
  const barColor = disabled ? theme.muted : theme.userAccent;

  return html`
    <${Box}
      borderStyle="bold"
      borderTop=${false}
      borderBottom=${false}
      borderRight=${false}
      borderColor=${barColor}
      paddingX=${2}
      paddingY=${1}
      backgroundColor=${theme.inputBg}
    >
      <${Text} color=${markerColor}>${"❯ "}<//>
      ${prefix ? html`<${Text} color=${theme.warn}>${`${prefix}   `}<//>` : null}
      <${PromptLine} view=${view} blinkOn=${blinkOn} disabled=${disabled} />
    <//>
  `;
}
