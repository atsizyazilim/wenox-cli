import { html } from "htm/react";
import { Box, Text } from "ink";
import { theme } from "../theme.js";
import { t } from "../../i18n/index.js";

function Bar({ children }) {
  return html`
    <${Box}>
      <${Text} color=${theme.menuSelectedBg}>${"│ "}<//>
      ${children}
    <//>
  `;
}

function Option({ label, selected }) {
  if (selected) {
    return html`
      <${Text} color=${theme.menuSelectedFg} backgroundColor=${theme.menuSelectedBg}>${`  ${label}  `}<//>
    `;
  }
  return html`<${Text} color=${theme.muted}>${`  ${label}  `}<//>`;
}

export function Permission({ path: target, pattern, choice = 0 }) {
  const options = [
    t("permission.allowOnce"),
    t("permission.allowAlways"),
    t("permission.reject"),
  ];

  return html`
    <${Box} flexDirection="column" flexShrink=${0} paddingX=${1} marginBottom=${1}>
      <${Bar}><${Text} bold color=${theme.menuSelectedBg}>${t("permission.title")}<//><//>
      <${Bar}><${Text} color=${theme.menuDesc}>${t("permission.accessExternal", { path: target })}<//><//>
      <${Bar}><${Text}>${" "}<//><//>
      <${Bar}><${Text} bold color=${theme.menuDesc}>${t("permission.patterns")}<//><//>
      <${Bar}><${Text} color=${theme.menuDesc}>${`  – ${pattern}`}<//><//>
      <${Bar}><${Text}>${" "}<//><//>
      <${Bar}>
        <${Text}>${" "}<//>
        ${options.map((label, i) => html`<${Option} key=${i} label=${label} selected=${i === choice} />`)}
      <//>
      <${Bar}><${Text}>${" "}<//><//>
      <${Bar}><${Text} color=${theme.muted}>${t("permission.hint")}<//><//>
    <//>
  `;
}
