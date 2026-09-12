import stringWidth from "string-width";
import { t } from "../i18n/index.js";

export const MAX_INPUT_LINES = 6;

export function pasteLabel(lines) {
  return t("paste.label", { lines });
}

export function createTokens(text = "") {
  return text ? [{ type: "text", value: text }] : [];
}

export function toText(tokens) {
  return tokens.map((token) => token.value).join("");
}

export function clampCursor(tokens, cursor) {
  let i = Math.max(0, Math.min(tokens.length, cursor?.i ?? 0));
  if (i === tokens.length) return { i, o: 0 };
  const token = tokens[i];
  if (token.type === "paste") return { i, o: 0 };
  const o = Math.max(0, Math.min(token.value.length, cursor?.o ?? 0));
  return { i, o };
}

export function emptyCursor() {
  return { i: 0, o: 0 };
}

export function endCursor(tokens) {
  if (tokens.length === 0) return { i: 0, o: 0 };
  const last = tokens[tokens.length - 1];
  if (last.type === "paste") return { i: tokens.length, o: 0 };
  return { i: tokens.length - 1, o: last.value.length };
}

function splitAt(tokens, c, chip) {
  const next = [...tokens];
  if (c.i === next.length) {
    next.push(chip);
    return { tokens: next, cursor: { i: next.length, o: 0 } };
  }
  const token = next[c.i];
  if (token.type === "text") {
    const left = token.value.slice(0, c.o);
    const right = token.value.slice(c.o);
    const parts = [];
    if (left) parts.push({ type: "text", value: left });
    parts.push(chip);
    if (right) parts.push({ type: "text", value: right });
    next.splice(c.i, 1, ...parts);
    const chipIndex = c.i + (left ? 1 : 0);
    return { tokens: next, cursor: { i: chipIndex + 1, o: 0 } };
  }
  next.splice(c.i, 0, chip);
  return { tokens: next, cursor: { i: c.i + 1, o: 0 } };
}

export function insertText(tokens, cursor, text) {
  if (!text) return { tokens, cursor };
  const next = [...tokens];
  const c = clampCursor(next, cursor);
  if (c.i === next.length) {
    next.push({ type: "text", value: text });
    return { tokens: next, cursor: { i: next.length - 1, o: text.length } };
  }
  const token = next[c.i];
  if (token.type === "text") {
    next[c.i] = {
      type: "text",
      value: token.value.slice(0, c.o) + text + token.value.slice(c.o),
    };
    return { tokens: next, cursor: { i: c.i, o: c.o + text.length } };
  }
  const prev = next[c.i - 1];
  if (prev && prev.type === "text") {
    next[c.i - 1] = { type: "text", value: prev.value + text };
    return { tokens: next, cursor: { i: c.i - 1, o: prev.value.length + text.length } };
  }
  next.splice(c.i, 0, { type: "text", value: text });
  return { tokens: next, cursor: { i: c.i, o: text.length } };
}

export function insertPaste(tokens, cursor, value, lines) {
  return splitAt(tokens, clampCursor(tokens, cursor), { type: "paste", value, lines });
}

export function backspace(tokens, cursor) {
  const next = [...tokens];
  const c = clampCursor(next, cursor);
  if (next.length === 0) return { tokens: next, cursor: c };

  if (c.i === next.length) {
    const last = next[next.length - 1];
    if (last.type === "paste" || last.value.length <= 1) {
      next.pop();
      return { tokens: next, cursor: { i: next.length, o: 0 } };
    }
    next[next.length - 1] = { type: "text", value: last.value.slice(0, -1) };
    return { tokens: next, cursor: { i: next.length - 1, o: last.value.length - 1 } };
  }

  const token = next[c.i];
  if (token.type === "text" && c.o > 0) {
    next[c.i] = {
      type: "text",
      value: token.value.slice(0, c.o - 1) + token.value.slice(c.o),
    };
    return { tokens: next, cursor: { i: c.i, o: c.o - 1 } };
  }
  if (c.i === 0) return { tokens: next, cursor: c };

  const prev = next[c.i - 1];
  if (prev.type === "paste" || prev.value.length <= 1) {
    next.splice(c.i - 1, 1);
    return { tokens: next, cursor: { i: c.i - 1, o: 0 } };
  }
  next[c.i - 1] = { type: "text", value: prev.value.slice(0, -1) };
  return { tokens: next, cursor: { i: c.i - 1, o: prev.value.length - 1 } };
}

export function deleteForward(tokens, cursor) {
  const next = [...tokens];
  const c = clampCursor(next, cursor);
  if (c.i === next.length) return { tokens: next, cursor: c };

  const token = next[c.i];
  if (token.type === "paste") {
    next.splice(c.i, 1);
    return { tokens: next, cursor: { i: c.i, o: 0 } };
  }
  if (c.o < token.value.length) {
    next[c.i] = {
      type: "text",
      value: token.value.slice(0, c.o) + token.value.slice(c.o + 1),
    };
    return { tokens: next, cursor: c };
  }
  const nx = next[c.i + 1];
  if (!nx) return { tokens: next, cursor: c };
  if (nx.type === "paste" || nx.value.length <= 1) {
    next.splice(c.i + 1, 1);
    return { tokens: next, cursor: c };
  }
  next[c.i + 1] = { type: "text", value: nx.value.slice(1) };
  return { tokens: next, cursor: c };
}

export function moveLeft(tokens, cursor) {
  const c = clampCursor(tokens, cursor);
  if (c.i === tokens.length) {
    if (tokens.length === 0) return c;
    const last = tokens[tokens.length - 1];
    if (last.type === "paste") return { i: tokens.length - 1, o: 0 };
    return { i: tokens.length - 1, o: last.value.length };
  }
  const token = tokens[c.i];
  if (c.o > 0) return { i: c.i, o: c.o - 1 };
  if (c.i === 0) return c;
  const prev = tokens[c.i - 1];
  if (prev.type === "paste") return { i: c.i - 1, o: 0 };
  return { i: c.i - 1, o: prev.value.length };
}

export function moveRight(tokens, cursor) {
  const c = clampCursor(tokens, cursor);
  if (c.i === tokens.length) return c;
  const token = tokens[c.i];
  if (token.type === "paste") return { i: c.i + 1, o: 0 };
  if (c.o < token.value.length) return { i: c.i, o: c.o + 1 };
  return { i: c.i + 1, o: 0 };
}

export function buildView(tokens, width, cursor, { mask, maxLines = MAX_INPUT_LINES } = {}) {
  const units = [];
  tokens.forEach((token, ti) => {
    if (token.type === "paste") {
      units.push({ kind: "chip", display: pasteLabel(token.lines ?? 1) });
      return;
    }
    for (const ch of token.value) {
      units.push({ kind: "char", display: mask ? mask : ch });
    }
  });

  const c = clampCursor(tokens, cursor);
  let cursorUnit = 0;
  for (let i = 0; i < c.i; i += 1) {
    cursorUnit += tokens[i].type === "paste" ? 1 : tokens[i].value.length;
  }
  if (c.i < tokens.length && tokens[c.i].type === "text") cursorUnit += c.o;

  const lines = [];
  let segs = [];
  let lineWidth = 0;
  let cursorLine = 0;
  let cursorCol = 0;
  let cursorChar = " ";

  const flush = () => {
    lines.push(segs);
    segs = [];
    lineWidth = 0;
  };

  for (let idx = 0; idx <= units.length; idx += 1) {
    if (idx === cursorUnit) {
      cursorLine = lines.length;
      cursorCol = lineWidth;
      cursorChar = idx < units.length && units[idx].kind === "char" ? units[idx].display : " ";
    }
    if (idx === units.length) break;

    const unit = units[idx];
    const unitWidth = stringWidth(unit.display);

    if (lineWidth + unitWidth > width && lineWidth > 0) {
      flush();
      if (idx === cursorUnit) {
        cursorLine = lines.length;
        cursorCol = 0;
      }
    }

    if (unit.kind === "chip") {
      segs.push({ text: unit.display, chip: true });
    } else {
      const last = segs[segs.length - 1];
      if (last && !last.chip) last.text += unit.display;
      else segs.push({ text: unit.display, chip: false });
    }
    lineWidth += unitWidth;
  }
  flush();

  const total = Math.max(1, lines.length);
  let start = 0;
  if (total > maxLines) {
    start = Math.min(Math.max(0, cursorLine - Math.floor(maxLines / 2)), total - maxLines);
  }

  const visible = (lines.length === 0 ? [[]] : lines).slice(start, start + maxLines);
  while (visible.length < 1) visible.push([]);

  return {
    lines: visible,
    cursorLine: cursorLine - start,
    cursorCol,
    cursorChar,
    totalLines: total,
  };
}
