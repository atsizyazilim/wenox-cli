import { html } from "htm/react";
import { Box, Text } from "ink";
import { theme } from "../theme.js";
import { t } from "../../i18n/index.js";

function Option({
  label,
  selected,
  color,
}: {
  label: string;
  selected: boolean;
  color: string;
}) {
  if (selected) {
    return html`
      <${Text} bold color="white" backgroundColor=${color}>${`  ❯ ${label}  `}<//>
    `;
  }
  return html`<${Text} color=${theme.muted}>${`    ${label}  `}<//>`;
}

export function Approval({
  command,
  allow = true,
}: {
  command: string;
  allow?: boolean;
}) {
  return html`
    <${Box} flexDirection="column" flexShrink=${0} paddingX=${2} marginBottom=${1}>
      <${Text} color=${theme.warn} bold>${t("approval.title")}<//>
      <${Text} color=${theme.warn} bold>${`  ${command}`}<//>
      <${Box} marginTop=${1}>
        <${Option} label="Allow" selected=${allow} color=${theme.ok} />
        <${Text}>${"  "}<//>
        <${Option} label="Disallow" selected=${!allow} color=${theme.err} />
      <//>
      <${Box} marginTop=${1}>
        <${Text} color=${theme.muted}>${t("approval.hint")}<//>
      <//>
    <//>
  `;
}
