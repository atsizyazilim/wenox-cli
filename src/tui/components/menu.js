import { html } from "htm/react";
import { Box, Text } from "ink";
import { theme } from "../theme.js";

const MAX_VISIBLE = 10;

export function Menu({ items, index, nameWidth = 16, hint }) {
  if (items.length === 0) return null;

  const total = items.length;
  let start = 0;
  if (total > MAX_VISIBLE) {
    start = Math.min(Math.max(0, index - Math.floor(MAX_VISIBLE / 2)), total - MAX_VISIBLE);
  }
  const visible = items.slice(start, start + MAX_VISIBLE);

  return html`
    <${Box} flexDirection="column" width="100%">
      ${visible.map((item, offset) => {
        const i = start + offset;
        const active = i === index;
        const fg = active ? theme.menuSelectedFg : undefined;
        return html`
          <${Box}
            key=${item.value}
            width="100%"
            paddingX=${2}
            backgroundColor=${active ? theme.menuSelectedBg : undefined}
          >
            <${Text} color=${active ? fg : theme.menuText}>${String(item.left).padEnd(nameWidth)}<//>
            <${Text} color=${active ? fg : theme.menuDesc}>${item.right}<//>
          <//>
        `;
      })}
      ${hint
        ? html`<${Box} paddingX=${2} marginTop=${1}>
            <${Text} color=${theme.muted}>${hint}<//>
          <//>`
        : null}
    <//>
  `;
}
