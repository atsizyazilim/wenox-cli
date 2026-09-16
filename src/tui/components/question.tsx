import { Box, Text } from "ink";
import type { ReactNode } from "react";
import { theme } from "../theme.js";
import { t } from "../../i18n/index.js";

function Bar({ children }: { children?: ReactNode }) {
  return (
    <Box>
      <Text color={theme.questionBar}>{"│ "}</Text>
      {children}
    </Box>
  );
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

  return (
    <Box flexDirection="column" flexShrink={0} paddingX={1} marginBottom={1}>
      <Bar>
        <Text bold color="white">
          {question}
        </Text>
      </Bar>

      {items.map((item, i) => {
        const active = i === index;
        return (
          <Box key={i} flexDirection="column">
            <Bar>
              <Text color={theme.muted}>{`${i + 1}. `}</Text>
              <Text bold={active} color={active ? theme.questionLink : "white"}>
                {item.label}
              </Text>
            </Bar>
            {item.description ? (
              <Bar>
                <Text color={theme.menuDesc}>{`   ${item.description}`}</Text>
              </Bar>
            ) : null}
          </Box>
        );
      })}

      <Bar>
        <Text>{" "}</Text>
      </Bar>
      <Bar>
        <Text color={theme.muted}>
          {typing ? t("question.hintType") : t("question.hintSelect")}
        </Text>
      </Bar>
    </Box>
  );
}
