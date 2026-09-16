import { html } from "htm/react";
import { Box, Text } from "ink";
import type { ReactNode } from "react";
import stringWidth from "string-width";
import { theme } from "../theme.js";
import type { InputSegment, InputView } from "../input-model.js";

function renderLine(
  segs: InputSegment[],
  cursorCol: number | null,
  cursorChar: string,
  blink: boolean,
): ReactNode[] {
  const nodes: ReactNode[] = [];
  let placed = cursorCol === null;
  let width = 0;
  let buffer = "";

  const flush = (key: string) => {
    if (buffer) {
      nodes.push(html`<${Text} key=${key}>${buffer}<//>`);
      buffer = "";
    }
  };

  segs.forEach((seg, si) => {
    if (seg.chip) {
      if (!placed && width >= (cursorCol ?? 0)) {
        flush(`f${si}`);
        nodes.push(html`<${Text} key=${`c${si}`} inverse=${blink}>${cursorChar}<//>`);
        width += 1;
        placed = true;
      }
      flush(`p${si}`);
      nodes.push(html`
        <${Text}
          key=${`s${si}`}
          backgroundColor=${theme.menuSelectedBg}
          color=${theme.menuSelectedFg}
        >${seg.text}<//>
      `);
      width += stringWidth(seg.text);
      return;
    }

    for (const ch of seg.text) {
      if (!placed && width >= (cursorCol ?? 0)) {
        flush(`fc${si}${width}`);
        nodes.push(html`<${Text} key=${`cc${si}${width}`} inverse=${blink}>${ch}<//>`);
        width += stringWidth(ch);
        placed = true;
        continue;
      }
      buffer += ch;
      width += stringWidth(ch);
    }
  });

  if (!placed) {
    flush("fz");
    nodes.push(html`<${Text} key="cz" inverse=${blink}>${cursorChar}<//>`);
  }
  flush("fend");

  return nodes;
}

export function PromptLine({
  view,
  blinkOn,
  disabled,
}: {
  view: InputView;
  blinkOn?: boolean;
  disabled?: boolean;
}) {
  const blink = disabled ? true : blinkOn;

  return html`
    <${Box} flexDirection="column">
      ${view.lines.map((segs, li) => {
        const isCursorLine = li === view.cursorLine;
        const nodes = renderLine(
          segs,
          isCursorLine ? view.cursorCol : null,
          view.cursorChar,
          blink ?? false,
        );
        return html`<${Text} key=${li}>${nodes.length > 0 ? nodes : " "}<//>`;
      })}
    <//>
  `;
}
