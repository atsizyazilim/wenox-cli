import { spawn } from "node:child_process";

export function copyToClipboard(text) {
  if (!text) return false;

  try {
    if (process.platform === "win32") {
      const encoded = Buffer.from(text, "utf8").toString("base64");
      const script = `Set-Clipboard -Value ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encoded}')))`;
      const child = spawn("powershell", ["-NoProfile", "-NonInteractive", "-Command", script], {
        stdio: "ignore",
        windowsHide: true,
      });
      child.on("error", () => {});
      return true;
    }

    const command = process.platform === "darwin" ? "pbcopy" : "xclip";
    const args = process.platform === "darwin" ? [] : ["-selection", "clipboard"];
    const child = spawn(command, args, { stdio: ["pipe", "ignore", "ignore"] });
    child.on("error", () => {});
    child.stdin.on("error", () => {});
    child.stdin.end(text);
    return true;
  } catch {
    return false;
  }
}
