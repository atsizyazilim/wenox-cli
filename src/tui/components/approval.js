import { html } from "htm/react";
import { Box, Text } from "ink";
import { theme } from "../theme.js";
import { t } from "../../i18n/index.js";

function Option({ label, selected, color }) {
  if (selected) {
    return html`
      <${Text} bold color="white" backgroundColor=${color}>${`  ❯ ${label}  `}<//>
    `;
  }
  return html`<${Text} color=${theme.muted}>${`    ${label}  `}<//>`;
}

export function Approval({ command, allow = true }) {
  return html`
    <${Box} flexDirection="column" paddingX=${2} marginBottom=${1}>
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
