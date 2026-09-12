import { html } from "htm/react";
import { Text } from "ink";
import { theme } from "../theme.js";

// Tam genişlikte tek satırlık bildirim şeridi. En üstteki transkript satırının
// yerine geçer; komut bloklarının üstüne binmediği için çakışma olmaz.
export function ToastRow({ text, width }) {
  const label = `  ${text}  `;
  const filler = " ".repeat(Math.max(0, width - label.length - 2));

  return html`
    <${Text} backgroundColor=${theme.toastBg}>
      ${filler}
      <${Text} color=${theme.toastBar} bold>${"▌"}<//>
      <${Text} color=${theme.toastFg} bold>${label}<//>
      <${Text} color=${theme.toastBar} bold>${"▌"}<//>
    <//>
  `;
}
