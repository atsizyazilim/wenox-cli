import { html } from "htm/react";
import { Text } from "ink";
import { theme } from "../theme.js";

export function toastCard(text) {
  const label = `  ${text}  `;
  const blank = " ".repeat(label.length);

  const row = (content, bold) => html`
    <${Text} backgroundColor=${theme.toastBg}>
      <${Text} color=${theme.toastBar} bold>${"▌"}<//>
      <${Text} color=${theme.toastFg} bold=${bold}>${content}<//>
      <${Text} color=${theme.toastBar} bold>${"▌"}<//>
    <//>
  `;

  return {
    width: label.length + 2,
    rows: [row(blank, false), row(label, true), row(blank, false)],
  };
}
