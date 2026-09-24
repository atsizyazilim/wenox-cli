import { Box, Text } from "ink";
import os from "node:os";
import { theme } from "../theme.js";
import { formatTokens } from "../view.js";
import { CONTEXT_WINDOW } from "../../config.js";
import { t, localeTag } from "../../i18n/index.js";
import type { AccountInfo } from "../../account.js";

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
        <Text color={theme.muted}>{t("status.imageHint")}</Text>
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
  usage,
  contextWindow = CONTEXT_WINDOW,
}: {
  cwd: string;
  tokens?: number | null;
  credits?: number | null;
  usage?: AccountInfo["usage_limits"] | null;
  contextWindow?: number;
}) {
  const pct = tokens && contextWindow ? ((tokens / contextWindow) * 100).toFixed(1) : "0.0";
  const creditText =
    typeof credits === "number"
      ? credits.toLocaleString(localeTag())
      : t("status.noCredits");

  // Sunucu limit pencereleri gönderiyorsa (kredi sisteminin yerini aldı)
  // 5 saatlik pencereyi gösteriyoruz: kullanım yüzdesi + yenilenme saati.
  const window = usage?.five_hour;
  const usedPct = typeof window?.used_percent === "number" ? window.used_percent : null;
  const resetAt = window?.resets_at ? new Date(window.resets_at) : null;
  const resetTime =
    resetAt && !Number.isNaN(resetAt.getTime())
      ? resetAt.toLocaleTimeString(localeTag(), { hour: "2-digit", minute: "2-digit" })
      : null;
  const limitColor =
    usedPct === null ? theme.muted : usedPct >= 90 ? theme.err : usedPct >= 75 ? theme.warn : theme.ok;

  return (
    <Box justifyContent="space-between" paddingX={2} width="100%">
      <Text color={theme.muted}>{shortCwd(cwd)}</Text>
      <Text color={theme.muted}>
        {`${formatTokens(tokens)} (${pct}%)   `}
        {usedPct === null ? (
          <>
            {t("status.credits")}
            <Text bold color="white">
              {creditText}
            </Text>
          </>
        ) : (
          <>
            {`${t("status.limit5h")} `}
            <Text bold color={limitColor}>
              {`${usedPct.toLocaleString(localeTag(), {
                minimumFractionDigits: 1,
                maximumFractionDigits: 1,
              })}%`}
            </Text>
            {resetTime ? (
              <Text color={theme.muted}>{` · ${t("status.resets")} ${resetTime}`}</Text>
            ) : null}
          </>
        )}
      </Text>
    </Box>
  );
}
