import fs from "node:fs";

const ALT_SCREEN_ON = "\x1b[?1049h";
const ALT_SCREEN_OFF = "\x1b[?1049l";
const HIDE_CURSOR = "\x1b[?25l";
const SHOW_CURSOR = "\x1b[?25h";
const MOUSE_ON = "\x1b[?1002h\x1b[?1006h";
const MOUSE_OFF = "\x1b[?1002l\x1b[?1006l";

let active = false;

// Çıkış dizileri SENKRON yazılmalı: process.stdout.write asenkron olduğu için
// süreç kapanınca kaybolabiliyor ve terminal fare modunda kalıyordu (fare
// hareketleri kabuğa escape dizisi olarak dökülüyordu).
function writeSync(sequence) {
  try {
    fs.writeSync(1, sequence);
  } catch {
    try {
      process.stdout.write(sequence);
    } catch {
      // yoksay
    }
  }
}

export function enterFullScreen() {
  if (active || !process.stdout.isTTY) return;
  process.stdout.write(`${ALT_SCREEN_ON}\x1b[2J\x1b[H${HIDE_CURSOR}${MOUSE_ON}`);
  active = true;
}

export function leaveFullScreen() {
  if (!active) return;
  writeSync(`${MOUSE_OFF}${SHOW_CURSOR}${ALT_SCREEN_OFF}`);
  active = false;
}

const MOUSE_SGR = /^\[<(\d+);(\d+);(\d+)([Mm])$/;

export function parseMouse(input) {
  if (!input) return null;
  const match = MOUSE_SGR.exec(input);
  if (!match) return null;

  const code = Number(match[1]);
  const x = Number(match[2]);
  const y = Number(match[3]);
  const suffix = match[4];

  if ((code & 64) === 64) {
    const wheel = code & 1 ? "wheel-down" : "wheel-up";
    return { type: wheel, x, y };
  }

  const button = code & 3;
  if (suffix === "m") return { type: "release", button, x, y };
  if ((code & 32) === 32) return { type: "motion", button, x, y };
  return { type: "press", button, x, y };
}

export function setTitle(text) {
  if (!process.stdout.isTTY) return;
  process.stdout.write(`\x1b]0;${text}\x07`);
}
