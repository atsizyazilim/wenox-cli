import { html } from "htm/react";
import { Text } from "ink";
import stringWidth from "string-width";
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

// Sağa yaslı üç satırlık kompakt kart. Transkriptin üzerine bindirilir: sadece
// kapladığı dikey şerit örtülür, satırın geri kalanı görünür kalır.
export function toastCard(text) {
  const label = `  ${text}  `;
  const blank = " ".repeat(label.length);
  return {
    width: stringWidth(label) + 2,
    rows: [row(blank, false), row(label, true), row(blank, false)],
  };
}
