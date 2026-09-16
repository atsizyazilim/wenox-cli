import { Text } from "ink";
import type { ReactNode } from "react";
import stringWidth from "string-width";
import { theme } from "../theme.js";

export interface ToastCard {
  width: number;
  rows: ReactNode[];
}

function row(content: string, bold: boolean): ReactNode {
  return (
    <Text backgroundColor={theme.toastBg}>
      <Text color={theme.toastBar} bold>
        {"▌"}
      </Text>
      <Text color={theme.toastFg} bold={bold}>
        {content}
      </Text>
      <Text color={theme.toastBar} bold>
        {"▌"}
      </Text>
    </Text>
  );
}

// Sağa yaslı üç satırlık kompakt kart. Transkriptin üzerine bindirilir: sadece
// kapladığı dikey şerit örtülür, satırın geri kalanı görünür kalır.
export function toastCard(text: string): ToastCard {
  const label = `  ${text}  `;
  const blank = " ".repeat(label.length);
  return {
    width: stringWidth(label) + 2,
    rows: [row(blank, false), row(label, true), row(blank, false)],
  };
}
