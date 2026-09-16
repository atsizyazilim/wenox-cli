import { Box, Text } from "ink";
import type { ReactNode } from "react";
import { theme } from "../theme.js";
import { t } from "../../i18n/index.js";

function Bar({ children }: { children?: ReactNode }) {
  return (
    <Box>
      <Text color={theme.menuSelectedBg}>{"│ "}</Text>
      {children}
    </Box>
  );
}

function Option({ label, selected }: { label: string; selected: boolean }) {
  if (selected) {
    return (
      <Text color={theme.menuSelectedFg} backgroundColor={theme.menuSelectedBg}>
        {`  ${label}  `}
      </Text>
    );
  }
  return <Text color={theme.muted}>{`  ${label}  `}</Text>;
}

export function Permission({
  path: target,
  pattern,
  choice = 0,
}: {
  path: string;
  pattern: string;
  choice?: number;
}) {
  const options = [
    t("permission.allowOnce"),
    t("permission.allowAlways"),
    t("permission.reject"),
  ];

  return (
    <Box flexDirection="column" flexShrink={0} paddingX={1} marginBottom={1}>
      <Bar>
        <Text bold color={theme.menuSelectedBg}>
          {t("permission.title")}
        </Text>
      </Bar>
      <Bar>
        <Text color={theme.menuDesc}>
          {t("permission.accessExternal", { path: target })}
        </Text>
      </Bar>
      <Bar>
        <Text>{" "}</Text>
      </Bar>
      <Bar>
        <Text bold color={theme.menuDesc}>
          {t("permission.patterns")}
        </Text>
      </Bar>
      <Bar>
        <Text color={theme.menuDesc}>{`  – ${pattern}`}</Text>
      </Bar>
      <Bar>
        <Text>{" "}</Text>
      </Bar>
      <Bar>
        <Text>{" "}</Text>
        {options.map((label, i) => (
          <Option key={i} label={label} selected={i === choice} />
        ))}
      </Bar>
      <Bar>
        <Text>{" "}</Text>
      </Bar>
      <Bar>
        <Text color={theme.muted}>{t("permission.hint")}</Text>
      </Bar>
    </Box>
  );
}
