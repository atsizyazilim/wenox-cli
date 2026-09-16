import stringWidth from "string-width";

const ESC = "\x1b[";

// Yalnızca ihtiyaç duyulan yüzey: terminal çıktısı taklit edilebilir kalsın diye
// NodeJS.WriteStream yerine yapısal bir tip kullanılıyor.
export interface LiveOut {
  isTTY?: boolean;
  columns?: number;
  write(chunk: string): unknown;
}

function measureLines(text: string, columns: number): number {
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
  readonly out: LiveOut;
  renderedLines: number;
  active: boolean;

  constructor(out: LiveOut = process.stdout) {
    this.out = out;
    this.renderedLines = 0;
    this.active = Boolean(out.isTTY);
  }

  get columns(): number {
    return this.out.columns || 80;
  }

  #clear(): void {
    if (this.renderedLines <= 0) return;
    this.out.write(`${ESC}${this.renderedLines}A`);
    this.out.write(`${ESC}0J`);
    this.renderedLines = 0;
  }

  update(text: string): void {
    if (!this.active) return;
    this.#clear();
    const block = text.endsWith("\n") ? text : `${text}\n`;
    this.out.write(block);
    this.renderedLines = measureLines(block, this.columns);
  }

  finish(text: string): void {
    if (!this.active) {
      if (text) this.out.write(text.endsWith("\n") ? text : `${text}\n`);
      return;
    }
    this.#clear();
    if (text) this.out.write(text.endsWith("\n") ? text : `${text}\n`);
  }

  clear(): void {
    if (!this.active) return;
    this.#clear();
  }
}
