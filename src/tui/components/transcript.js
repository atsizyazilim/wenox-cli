import { html } from "htm/react";
import { Box, Text } from "ink";
import { sliceByWidth, textWidth } from "../../utils.js";
import { theme } from "../theme.js";
import { ToastRow } from "./toast.js";

function rangeFor(selection, lineIndex, width) {
  if (!selection) return null;
  const { startLine, startCol, endLine, endCol } = selection;
  if (lineIndex < startLine || lineIndex > endLine) return null;
  const from = lineIndex === startLine ? startCol : 0;
  const to = lineIndex === endLine ? endCol : width;
  if (to <= from) return null;
  return [Math.max(0, from), Math.min(width, to)];
}

function renderLine(line, range, key) {
  const text = line === "" ? " " : line;
  if (!range) return html`<${Text} key=${key}>${text}<//>`;

  const before = sliceByWidth(text, 0, range[0]);
  const selected = sliceByWidth(text, range[0], range[1]);
  const after = sliceByWidth(text, range[1], textWidth(text));

  return html`
    <${Text} key=${key}>
      <${Text}>${before}<//>
      <${Text} backgroundColor=${theme.selectionBg} color=${theme.selectionFg}>${selected}<//>
      <${Text}>${after}<//>
    <//>
  `;
}

export function Transcript({ lines, offset, height, selection, toast, contentWidth }) {
  const visible = lines.slice(offset, offset + height);

  return html`
    <${Box} flexDirection="column" height=${height} overflow="hidden">
      ${visible.map((line, i) => {
        if (toast && i === 0) {
          return html`<${Box} key="toast"><${ToastRow} text=${toast} width=${contentWidth} /><//>`;
        }
        const lineIndex = offset + i;
        return renderLine(line, rangeFor(selection, lineIndex, textWidth(line)), lineIndex);
      })}
    <//>
  `;
}
