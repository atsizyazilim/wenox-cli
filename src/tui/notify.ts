// Terminal bildirimi ve zil. Masaüstü penceresi açmak yerine terminalin kendi
// protokolünü kullanıyoruz: OSC 9 (Windows Terminal/iTerm/ConEmu tostu) ve BEL.
// Desteklemeyen terminallerde bu diziler sessizce yutulur.

export function notify(body: string): void {
  if (!process.stdout.isTTY) return;
  try {
    // OSC 9 ; <mesaj> BEL — "toast" bildirimi.
    process.stdout.write(`\x1b]9;${body}\x07`);
  } catch {
    // yoksay
  }
}

export function ring(): void {
  if (!process.stdout.isTTY) return;
  try {
    process.stdout.write("\x07");
  } catch {
    // yoksay
  }
}
