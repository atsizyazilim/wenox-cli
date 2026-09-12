import { html } from "htm/react";
import { Box, Text } from "ink";
import os from "node:os";
import { theme } from "../theme.js";
import { formatTokens } from "../view.js";
import { CONTEXT_WINDOW } from "../../config.js";
import { t, localeTag } from "../../i18n/index.js";

function shortCwd(cwd) {
  const home = os.homedir();
  if (cwd.toLowerCase().startsWith(home.toLowerCase())) {
    return `~${cwd.slice(home.length)}`;
  }
  return cwd;
}

export function StatusRow({ modelName, mode = "build", autoApprove, premium }) {
  const modeLabel = mode === "plan" ? t("status.modePlan") : t("status.modeBuild");
  const modeColor = mode === "plan" ? theme.warn : theme.questionLink;
  return html`
    <${Box} justifyContent="space-between" paddingX=${2} marginTop=${1}>
      <${Text}>
        <${Text} bold color=${modeColor}>${modeLabel}<//>
        <${Text} color=${theme.muted}>${"  ·  "}<//>
        <${Text} color=${theme.muted}>${modelName}<//>
        ${autoApprove ? html`<${Text} color=${theme.warn}>${`  ·  ${t("status.autoApprove")}`}<//>` : null}
        ${premium ? html`<${Text} color=${theme.warn}>${`  ·  ${t("status.premium")}`}<//>` : null}
      <//>
      <${Text}>
        <${Text} color=${theme.muted}>${t("status.keysHint")}<//>
        <${Text} bold>${t("status.commands")}<//>
      <//>
    <//>
  `;
}

export function BottomBar({ cwd, tokens, credits, contextWindow = CONTEXT_WINDOW, cost = null }) {
  const pct = tokens && contextWindow ? ((tokens / contextWindow) * 100).toFixed(1) : "0.0";
  const creditText = typeof credits === "number" ? credits.toLocaleString(localeTag()) : t("status.noCredits");
  const costText = typeof cost === "number" ? `$${cost.toFixed(4)}` : "$0.00";
  return html`
    <${Box} justifyContent="space-between" paddingX=${2} width="100%">
      <${Text} color=${theme.muted}>${shortCwd(cwd)}<//>
      <${Text} color=${theme.muted}>
        ${`${formatTokens(tokens)} (${pct}%)  ·  ${costText}   `}
        ${t("status.credits")}
        <${Text} bold color="white">${creditText}<//>
      <//>
    <//>
  `;
}
