import { html } from "htm/react";
import { Text } from "ink";
import { theme } from "../theme.js";

function row(content, bold) {
  return html`
    <${Text} backgroundColor=${theme.toastBg}>
      <${Text} color=${theme.toastBar} bold>${"▌"}<//>
      <${Text} color=${theme.toastFg} bold=${bold}>${content}<//>
      <${Text} color=${theme.toastBar} bold>${"▌"}<//>
    <//>
  `;
}

// Üç satırlık kompakt kart (üst/alt boşluk + etiket). Transkriptin üst
// satırlarının yerine geçer, üzerine binmez.
export function toastRows(text) {
  const label = `  ${text}  `;
  const blank = " ".repeat(label.length);
  return [row(blank, false), row(label, true), row(blank, false)];
}

export const TOAST_HEIGHT = 3;
