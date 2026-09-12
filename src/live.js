import stringWidth from "string-width";

const ESC = "\x1b[";

function measureLines(text, columns) {
  if (!text) return 0;
  const normalized = text.endsWith("\n") ? text : `${text}\n`;
  const logical = normalized.split("\n");
  logical.pop();

  let total = 0;
  for (const line of logical) {
    const width = stringWidth(line);
    total += Math.max(1, Math.ceil(width / Math.max(1, columns)));
  }
  return total;
}

export class LiveWriter {
  constructor(out = process.stdout) {
    this.out = out;
    this.renderedLines = 0;
    this.active = Boolean(out.isTTY);
  }

  get columns() {
    return this.out.columns || 80;
  }

  #clear() {
    if (this.renderedLines <= 0) return;
    this.out.write(`${ESC}${this.renderedLines}A`);
    this.out.write(`${ESC}0J`);
    this.renderedLines = 0;
  }

  update(text) {
    if (!this.active) return;
    this.#clear();
    const block = text.endsWith("\n") ? text : `${text}\n`;
    this.out.write(block);
    this.renderedLines = measureLines(block, this.columns);
  }

  finish(text) {
    if (!this.active) {
      if (text) this.out.write(text.endsWith("\n") ? text : `${text}\n`);
      return;
    }
    this.#clear();
    if (text) this.out.write(text.endsWith("\n") ? text : `${text}\n`);
  }

  clear() {
    if (!this.active) return;
    this.#clear();
  }
}
