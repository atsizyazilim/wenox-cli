import { html } from "htm/react";
import { Box, Text } from "ink";
import { PromptLine } from "./prompt-line.js";
import { theme } from "../theme.js";
import type { InputView } from "../input-model.js";

export function InputBar({
  view,
  prefix,
  disabled,
  blinkOn,
  width,
  boxed = false,
}: {
  view: InputView;
  prefix?: string | null;
  disabled?: boolean;
  blinkOn?: boolean;
  width?: number;
  boxed?: boolean;
}) {
  const markerColor = disabled ? theme.muted : theme.accentBright;
  const barColor = disabled ? theme.muted : theme.userAccent;

  return html`
    <${Box}
      borderStyle="bold"
      borderTop=${false}
      borderBottom=${false}
      borderRight=${boxed}
      borderColor=${barColor}
      paddingX=${2}
      paddingY=${1}
      backgroundColor=${theme.inputBg}
      width=${width}
    >
      <${Text} color=${markerColor}>${"❯ "}<//>
      ${prefix ? html`<${Text} color=${theme.warn}>${`${prefix}   `}<//>` : null}
      <${PromptLine} view=${view} blinkOn=${blinkOn} disabled=${disabled} />
    <//>
  `;
}
