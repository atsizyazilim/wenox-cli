import readline from "node:readline";

// Alt komutlar için basit terminal soruları (TUI dışı). Yalnızca etkileşimli
// terminallerde kullanılır; TTY yoksa çağıran taraf hata verir.

export function askLine(prompt: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

// Anahtar gibi sırlar için: yazılan karakterler ekranda görünmez, her tuş "*"
// olarak yankılanır. (readline'ın çıktı yazıcısı sarmalanır; alan yoksa
// gizleme yapılamaz, o durumda düz soruya düşülür.)
export function askSecret(prompt: string): Promise<string> {
  if (!process.stdin.isTTY) return askLine(prompt);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  });
  const internal = rl as unknown as { _writeToOutput?: (text: string) => void };
  const original = internal._writeToOutput;
  if (typeof original === "function") {
    internal._writeToOutput = (text: string): void => {
      // İpucu ve satır sonu aynen yazılır, kullanıcının yazdığı gizlenir.
      if (text.includes(prompt) || text === "\r\n" || text === "\n") {
        original.call(rl, text);
      } else {
        original.call(rl, "*".repeat(Math.max(1, text.length)));
      }
    };
  }

  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}
