import os from "node:os";
import path from "node:path";

// Ev dizini, sürücü kökü veya sistem klasörleri gibi "proje olmayan" yerler.
const UNSAFE_POSIX = new Set([
  "/", "/root", "/etc", "/usr", "/bin", "/sbin", "/lib", "/lib64", "/var",
  "/opt", "/boot", "/dev", "/proc", "/sys", "/tmp", "/private", "/system",
  "/library", "/applications", "/volumes",
]);

const UNSAFE_WIN_NAMES = new Set([
  "windows", "program files", "program files (x86)", "programdata", "system32",
  "users", "appdata", "$recycle.bin", "recovery", "perflogs",
]);

export function isUnsafeWorkspace(dir = process.cwd()) {
  const target = path.resolve(dir);
  const lower = target.toLowerCase();

  // Dosya sistemi / sürücü kökü (C:\, D:\, /)
  if (target === path.parse(target).root) return true;

  const home = os.homedir();
  if (lower === home.toLowerCase()) return true;
  // Ev dizininin üstü (C:\Users, /home, /Users)
  if (lower === path.dirname(home).toLowerCase()) return true;

  const base = path.basename(target).toLowerCase();
  if (process.platform === "win32") return UNSAFE_WIN_NAMES.has(base);
  return UNSAFE_POSIX.has(lower);
}
