import { html } from "htm/react";
import { Box, Text } from "ink";
import type { ReactNode } from "react";
import { theme } from "../theme.js";
import { t } from "../../i18n/index.js";

function Bar({ children }: { children?: ReactNode }) {
  return html`
    <${Box}>
      <${Text} color=${theme.questionBar}>${"│ "}<//>
      ${children}
    <//>
  `;
}

export interface QuestionOption {
  label?: string;
  description?: string;
}

export function Question({
  question,
  options,
  index,
  typing,
}: {
  question: string;
  options: QuestionOption[];
  index: number;
  typing?: boolean;
}) {
  const items = [
    ...options.map((option) => ({
      label: option?.label ?? String(option),
      description: option?.description ?? "",
    })),
    { label: t("question.own"), description: "" },
  ];

  return html`
    <${Box} flexDirection="column" flexShrink=${0} paddingX=${1} marginBottom=${1}>
      <${Bar}><${Text} bold color="white">${question}<//><//>

      ${items.map((item, i) => {
        const active = i === index;
        return html`
          <${Box} key=${i} flexDirection="column">
            <${Bar}>
              <${Text} color=${theme.muted}>${`${i + 1}. `}<//>
              <${Text} bold=${active} color=${active ? theme.questionLink : "white"}>${item.label}<//>
            <//>
            ${item.description
              ? html`<${Bar}><${Text} color=${theme.menuDesc}>${`   ${item.description}`}<//><//>`
              : null}
          <//>
        `;
      })}

      <${Bar}><${Text}>${" "}<//><//>
      <${Bar}>
        <${Text} color=${theme.muted}>
          ${typing ? t("question.hintType") : t("question.hintSelect")}
        <//>
      <//>
    <//>
  `;
}
