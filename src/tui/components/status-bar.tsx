import { Box, Text } from "ink";
import os from "node:os";
import { theme } from "../theme.js";
import { formatTokens } from "../view.js";
import { CONTEXT_WINDOW } from "../../config.js";
import { t, localeTag } from "../../i18n/index.js";

function shortCwd(cwd: string): string {
  const home = os.homedir();
  if (cwd.toLowerCase().startsWith(home.toLowerCase())) {
    return `~${cwd.slice(home.length)}`;
  }
  return cwd;
}

export function StatusRow({
  modelName,
  mode = "build",
  autoApprove,
  premium,
}: {
  modelName: string;
  mode?: string;
  autoApprove?: boolean;
  premium?: boolean;
}) {
  const modeLabel = mode === "plan" ? t("status.modePlan") : t("status.modeBuild");
  const modeColor = mode === "plan" ? theme.warn : theme.questionLink;
  return (
    <Box justifyContent="space-between" paddingX={2} marginTop={1}>
      <Text>
        <Text bold color={modeColor}>
          {modeLabel}
        </Text>
        <Text color={theme.muted}>{"  ·  "}</Text>
        <Text color={theme.muted}>{modelName}</Text>
        {autoApprove ? (
          <Text color={theme.warn}>{`  ·  ${t("status.autoApprove")}`}</Text>
        ) : null}
        {premium ? (
          <Text color={theme.warn}>{`  ·  ${t("status.premium")}`}</Text>
        ) : null}
      </Text>
      <Text>
        <Text color={theme.muted}>{t("status.keysHint")}</Text>
        <Text bold>{t("status.commands")}</Text>
      </Text>
    </Box>
  );
}

export function BottomBar({
  cwd,
  tokens,
  credits,
  contextWindow = CONTEXT_WINDOW,
}: {
  cwd: string;
  tokens?: number | null;
  credits?: number | null;
  contextWindow?: number;
}) {
  const pct = tokens && contextWindow ? ((tokens / contextWindow) * 100).toFixed(1) : "0.0";
  const creditText =
    typeof credits === "number"
      ? credits.toLocaleString(localeTag())
      : t("status.noCredits");
  return (
    <Box justifyContent="space-between" paddingX={2} width="100%">
      <Text color={theme.muted}>{shortCwd(cwd)}</Text>
      <Text color={theme.muted}>
        {`${formatTokens(tokens)} (${pct}%)   `}
        {t("status.credits")}
        <Text bold color="white">
          {creditText}
        </Text>
      </Text>
    </Box>
  );
}
