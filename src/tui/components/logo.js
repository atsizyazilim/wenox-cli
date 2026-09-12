import { html } from "htm/react";
import { Box, Text } from "ink";
import { t } from "../../i18n/index.js";

export const LOGO_LINES = [
  " ██╗    ██╗███████╗███╗   ██╗ ██████╗ ██╗  ██╗",
  " ██║    ██║██╔════╝████╗  ██║██╔═══██╗╚██╗██╔╝",
  " ██║ █╗ ██║█████╗  ██╔██╗ ██║██║   ██║ ╚███╔╝ ",
  " ██║███╗██║██╔══╝  ██║╚██╗██║██║   ██║ ██╔██╗ ",
  " ╚███╔███╔╝███████╗██║ ╚████║╚██████╔╝██╔╝ ██╗",
  "  ╚══╝╚══╝ ╚══════╝╚═╝  ╚═══╝ ╚═════╝ ╚═╝  ╚═╝",
];

export function Logo() {
  return html`
    <${Box} flexDirection="column" alignItems="center">
      ${LOGO_LINES.map((line, index) =>
        html`<${Text} key=${index} color="white">${line}<//>`
      )}
      <${Box} marginTop=${1}>
        <${Text} color="gray">${t("logo.product")}<//>
        <${Text} color="gray">${t("logo.tagline")}<//>
      <//>
    <//>
  `;
}
