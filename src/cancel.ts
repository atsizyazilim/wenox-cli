import readline from "node:readline";
import { debugLog } from "./debug.js";
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
  debugLog(`requestCancel cancelled=${cancelled} hasAbort=${Boolean(abortHandler)}`);
  if (cancelled) return;
  cancelled = true;
  try {
    abortHandler?.();
    debugLog("abortHandler çalıştı");
  } catch {
    // ignore
  }
  onCancel?.();
}

// İptal edildiğinde fırlatılan hata: çağıran taraf bunu "kullanıcı iptal etti"
// olarak yorumlar (hata kartı göstermez).
export class CancelledError extends Error {
  constructor() {
    super("Operation canceled");
    this.name = "CancelledError";
  }
}

// SDK'nın abort'a tepki vermesini beklemek yerine, iptali kendimiz yarıştırıyoruz:
// bazı sağlayıcılarda akış abort'a rağmen kapanmıyor ve tur asılı kalıyordu.
export function raceWithCancel<T>(promise: Promise<T>): Promise<T> {
  if (cancelled) return Promise.reject(new CancelledError());
  return new Promise<T>((resolve, reject) => {
    const timer = setInterval(() => {
      if (!cancelled) return;
      clearInterval(timer);
      reject(new CancelledError());
    }, 100);
    timer.unref?.();
    promise.then(
      (value) => {
        clearInterval(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearInterval(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
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
