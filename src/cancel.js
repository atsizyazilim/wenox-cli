import readline from "node:readline";

let cancelled = false;
let listening = false;
let onCancel = null;
let abortHandler = null;

export function isCancelled() {
  return cancelled;
}

export function setAbortHandler(handler) {
  abortHandler = handler;
}

export function clearAbortHandler() {
  abortHandler = null;
}

export function requestCancel() {
  if (cancelled) return;
  cancelled = true;
  try {
    abortHandler?.();
  } catch {
    // ignore
  }
  onCancel?.();
}

export function resetCancel() {
  cancelled = false;
}

function handleKeypress(_str, key) {
  if (!key) return;
  const isCtrlC = key.ctrl && key.name === "c";
  if (key.name === "escape" || isCtrlC) {
    requestCancel();
  }
}

export function startCancelScope(callback) {
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

export function stopCancelScope() {
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
