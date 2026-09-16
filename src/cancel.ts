import readline from "node:readline";
import type { Key } from "node:readline";

let cancelled = false;
let listening = false;
let onCancel: (() => void) | null = null;
let abortHandler: (() => void) | null = null;

export function isCancelled(): boolean {
  return cancelled;
}

export function setAbortHandler(handler: (() => void) | null): void {
  abortHandler = handler;
}

export function clearAbortHandler(): void {
  abortHandler = null;
}

export function requestCancel(): void {
  if (cancelled) return;
  cancelled = true;
  try {
    abortHandler?.();
  } catch {
    // ignore
  }
  onCancel?.();
}

export function resetCancel(): void {
  cancelled = false;
}

// keypress olayı bazı durumlarda key olmadan da tetikleniyor, o yüzden opsiyonel.
function handleKeypress(_str: string, key: Key | undefined): void {
  if (!key) return;
  const isCtrlC = key.ctrl && key.name === "c";
  if (key.name === "escape" || isCtrlC) {
    requestCancel();
  }
}

export function startCancelScope(callback?: (() => void) | null): () => void {
  resetCancel();
  onCancel = callback ?? null;

  if (process.stdin.isTTY && !listening) {
    try {
      readline.emitKeypressEvents(process.stdin);
      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.on("keypress", handleKeypress);
      listening = true;
    } catch {
      listening = false;
    }
  }

  return stopCancelScope;
}

export function stopCancelScope(): void {
  if (listening) {
    process.stdin.off("keypress", handleKeypress);
    try {
      process.stdin.setRawMode(false);
    } catch {
      // ignore
    }
    listening = false;
  }
  onCancel = null;
}
