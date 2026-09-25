import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

// Panodan ve dosyadan ek okuma (görsel + PDF). Hiçbir fonksiyon hata fırlatmaz:
// ek yoksa ya da okunamıyorsa boş sonuç döner, arayüz kısa bir bilgi gösterir.

export interface Attachment {
  name: string;
  mime: string;
  data: string; // base64 (data: öneki olmadan)
}

export interface AttachmentRead {
  attachment?: Attachment;
  error?: "tooLarge" | "unreadable";
  // "tooLarge" durumunda hangi sınırın aşıldığını mesajda gösterebilmek için.
  limitMb?: number;
}

export type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }
  | { type: "file"; file: { filename: string; file_data: string } };

// Sağlayıcılar devasa base64 gövdesini reddediyor; tür başına makul sınırlar.
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_PDF_BYTES = 20 * 1024 * 1024;

const IMAGE_MIME_BY_EXT: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".bmp": "image/bmp",
};

const PDF_MIME = "application/pdf";

const MIME_BY_EXT: Record<string, string> = { ...IMAGE_MIME_BY_EXT, ".pdf": PDF_MIME };

const COMMAND_TIMEOUT_MS = 10_000;

export function isImage(attachment: Attachment): boolean {
  return attachment.mime.startsWith("image/");
}

export function mbLimit(mime?: string): number {
  const max = mime === PDF_MIME ? MAX_PDF_BYTES : MAX_IMAGE_BYTES;
  return Math.round(max / (1024 * 1024));
}

export function toDataUrl(attachment: Attachment): string {
  return `data:${attachment.mime};base64,${attachment.data}`;
}

// Modele gidecek içerik: metin (boşsa atlanır) + ekler sırayla.
export function contentParts(text: string, attachments: Attachment[]): ContentPart[] {
  const parts: ContentPart[] = [];
  if (text.trim()) parts.push({ type: "text", text });
  for (const attachment of attachments) {
    const url = toDataUrl(attachment);
    if (isImage(attachment)) {
      parts.push({ type: "image_url", image_url: { url } });
    } else {
      parts.push({ type: "file", file: { filename: attachment.name, file_data: url } });
    }
  }
  return parts;
}

function limitFor(mime: string): number {
  return mime === PDF_MIME ? MAX_PDF_BYTES : MAX_IMAGE_BYTES;
}

function fromBuffer(buffer: Buffer, name: string, mime: string): AttachmentRead {
  if (buffer.length === 0) return { error: "unreadable" };
  const limit = limitFor(mime);
  if (buffer.length > limit) return { error: "tooLarge", limitMb: mbLimit(mime) };
  return { attachment: { name, mime, data: buffer.toString("base64") } };
}

// Komutun stdout'unu toplar. Komut yoksa/başarısızsa boş tampon döner.
function run(command: string, args: string[]): Promise<Buffer> {
  return new Promise((resolve) => {
    let child;
    try {
      // stdin kapalı: açık boru, süreç bitse de olay döngüsünü ayakta tutuyor.
      child = spawn(command, args, { windowsHide: true, stdio: ["ignore", "pipe", "ignore"] });
    } catch {
      resolve(Buffer.alloc(0));
      return;
    }
    const chunks: Buffer[] = [];
    const timer = setTimeout(() => child?.kill(), COMMAND_TIMEOUT_MS);
    child.stdout?.on("data", (chunk: Buffer) => chunks.push(chunk));
    child.on("error", () => {
      clearTimeout(timer);
      resolve(Buffer.alloc(0));
    });
    child.on("close", () => {
      clearTimeout(timer);
      resolve(Buffer.concat(chunks));
    });
  });
}

// Windows: .NET üzerinden panodaki görüntü PNG olarak base64'e çevrilir.
const POWERSHELL_IMAGE =
  "Add-Type -AssemblyName System.Windows.Forms; $img = [System.Windows.Forms.Clipboard]::GetImage(); " +
  "if ($img) { $ms = New-Object System.IO.MemoryStream; " +
  "$img.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png); " +
  "[System.Convert]::ToBase64String($ms.ToArray()) }";

async function readClipboardWindows(): Promise<AttachmentRead> {
  const out = (
    await run("powershell.exe", ["-NonInteractive", "-NoProfile", "-command", POWERSHELL_IMAGE])
  )
    .toString("utf8")
    .trim();
  if (!out) return { error: "unreadable" };
  return fromBuffer(Buffer.from(out, "base64"), "clipboard", "image/png");
}

// macOS: pano PNG'si geçici bir dosyaya yazılıp okunur.
async function readClipboardMac(): Promise<AttachmentRead> {
  const file = path.join(os.tmpdir(), `wenox-paste-${process.pid}-${Date.now()}.png`);
  const script = [
    'set imageData to the clipboard as "PNGf"',
    `set fileRef to open for access POSIX file "${file}" with write permission`,
    "set eof fileRef to 0",
    "write imageData to fileRef",
    "close access fileRef",
  ];
  const args = script.flatMap((line) => ["-e", line]);
  try {
    await run("osascript", args);
    if (!fs.existsSync(file)) return { error: "unreadable" };
    return fromBuffer(fs.readFileSync(file), "clipboard", "image/png");
  } catch {
    return { error: "unreadable" };
  } finally {
    try {
      fs.rmSync(file, { force: true });
    } catch {
      // geçici dosya silinemese de devam
    }
  }
}

async function readClipboardLinux(): Promise<AttachmentRead> {
  const wayland = await run("wl-paste", ["-t", "image/png"]);
  if (wayland.length > 0) return fromBuffer(wayland, "clipboard", "image/png");
  const x11 = await run("xclip", ["-selection", "clipboard", "-t", "image/png", "-o"]);
  if (x11.length > 0) return fromBuffer(x11, "clipboard", "image/png");
  return { error: "unreadable" };
}

export async function readClipboardImage(): Promise<AttachmentRead> {
  if (process.platform === "win32" || process.env.WSL_DISTRO_NAME) {
    return readClipboardWindows();
  }
  if (process.platform === "darwin") return readClipboardMac();
  return readClipboardLinux();
}

// Çok büyük panolara karşı üst sınır (karakter). Metin yapıştırması zaten
// girdi modelinde kırpılıyor; buradaki sınır belleği korumak için.
export const MAX_CLIPBOARD_TEXT = 200_000;

export function limitClipboardText(raw: string): string {
  return raw.slice(0, MAX_CLIPBOARD_TEXT);
}

// Panodaki düz metin. Pano yalnızca görsel içeriyorsa ya da okunamıyorsa "" döner.
// Ctrl+V'nin görsel bulamayınca metne düşebilmesi için var.
export async function readClipboardText(): Promise<string> {
  if (process.platform === "win32" || process.env.WSL_DISTRO_NAME) {
    const out = await run("powershell.exe", [
      "-NonInteractive",
      "-NoProfile",
      "-command",
      "Get-Clipboard -Raw",
    ]);
    return limitClipboardText(out.toString("utf8"));
  }
  if (process.platform === "darwin") {
    return limitClipboardText((await run("pbpaste", [])).toString("utf8"));
  }
  const wayland = await run("wl-paste", ["-n"]);
  if (wayland.length > 0) return limitClipboardText(wayland.toString("utf8"));
  return limitClipboardText((await run("xclip", ["-selection", "clipboard", "-o"])).toString("utf8"));
}

export function readAttachmentFile(filePath: string): AttachmentRead {
  const mime = MIME_BY_EXT[path.extname(filePath).toLowerCase()];
  if (!mime) return { error: "unreadable" };
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) return { error: "unreadable" };
    if (stat.size > limitFor(mime)) return { error: "tooLarge", limitMb: mbLimit(mime) };
    return fromBuffer(fs.readFileSync(filePath), path.basename(filePath), mime);
  } catch {
    return { error: "unreadable" };
  }
}

function unwrap(raw: string): string {
  let value = raw.trim();
  if (/^file:\/\//i.test(value)) {
    try {
      value = fileURLToPath(value);
    } catch {
      return "";
    }
  }
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  return value.trim();
}

// Terminale sürüklenen dosya yol olarak yapışır (tırnaklı olabilir, birden çok
// dosya olabilir). Metnin tamamı ek dosyasıysa yolları döner, değilse null.
export function attachmentPathsIn(text: string): string[] | null {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return null;

  const candidates: string[] = [];
  for (const line of lines) {
    const quoted = line.match(/"([^"]+)"|'([^']+)'/g);
    if (quoted && line.replace(/"([^"]+)"|'([^']+)'/g, "").trim() === "") {
      candidates.push(...quoted.map(unwrap));
    } else {
      candidates.push(unwrap(line));
    }
  }

  const paths: string[] = [];
  for (const candidate of candidates) {
    if (!candidate || !MIME_BY_EXT[path.extname(candidate).toLowerCase()]) return null;
    if (!fs.existsSync(candidate)) return null;
    paths.push(candidate);
  }
  return paths.length > 0 ? paths : null;
}
