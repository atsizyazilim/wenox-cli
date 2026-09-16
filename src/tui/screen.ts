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
function writeSync(sequence: string): void {
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

// WENOX_NO_MOUSE=1 ile fare takibi kapatılır: tekerleği ve seçimi terminal
// kendi yapar (native scrollback). Sorun çıkarsa kaçış yolu.
const MOUSE_ENABLED = !process.env.WENOX_NO_MOUSE;

export function enterFullScreen(): void {
  if (active || !process.stdout.isTTY) return;
  const mouse = MOUSE_ENABLED ? MOUSE_ON : "";
  process.stdout.write(`${ALT_SCREEN_ON}\x1b[2J\x1b[H${HIDE_CURSOR}${mouse}`);
  active = true;
}

// Ink raw mode'u kapatmadan ÖNCE fareyi kapat: aradaki boşlukta gelen fare
// olayları echo ile kabuğa escape dizisi olarak dökülüyordu.
export function disableMouse(): void {
  if (!process.stdout.isTTY) return;
  writeSync(MOUSE_OFF);
}

export function leaveFullScreen(): void {
  if (!active) return;
  writeSync(`${MOUSE_OFF}${SHOW_CURSOR}${ALT_SCREEN_OFF}`);
  active = false;
}

const MOUSE_SGR = /^\[<(\d+);(\d+);(\d+)([Mm])$/;

export type MouseEvent =
  | { type: "wheel-up"; x: number; y: number }
  | { type: "wheel-down"; x: number; y: number }
  | { type: "press"; button: number; x: number; y: number }
  | { type: "release"; button: number; x: number; y: number }
  | { type: "motion"; button: number; x: number; y: number };

export function parseMouse(input: string | null | undefined): MouseEvent | null {
  if (!input) return null;
  const match = MOUSE_SGR.exec(input);
  if (!match) return null;

  const code = Number(match[1]);
  const x = Number(match[2]);
  const y = Number(match[3]);
  const suffix = match[4];

  if ((code & 64) === 64) {
    return code & 1 ? { type: "wheel-down", x, y } : { type: "wheel-up", x, y };
  }

  const button = code & 3;
  if (suffix === "m") return { type: "release", button, x, y };
  if ((code & 32) === 32) return { type: "motion", button, x, y };
  return { type: "press", button, x, y };
}

export function setTitle(text: string): void {
  if (!process.stdout.isTTY) return;
  process.stdout.write(`\x1b]0;${text}\x07`);
}
