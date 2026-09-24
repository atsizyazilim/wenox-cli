import fs from "node:fs";
import path from "node:path";

// Prompt'ta `@` ile dosya bahsetme: proje ağacı bir kez taranıp kısa süre
// önbellekte tutulur — ajan yeni dosya oluştursa bile liste çok bayatlamasın.

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "out",
  "coverage",
  ".next",
  ".nuxt",
  "target",
  "vendor",
  ".venv",
  "venv",
  "__pycache__",
  ".cache",
  ".turbo",
]);

const MAX_FILES = 20_000;
const MAX_DEPTH = 12;
const CACHE_MS = 10_000;

let cache: { root: string; at: number; files: string[] } | null = null;

export function projectFiles(root: string): string[] {
  const now = Date.now();
  if (cache && cache.root === root && now - cache.at < CACHE_MS) return cache.files;

  const files: string[] = [];
  const walk = (dir: string, depth: number): void => {
    if (files.length >= MAX_FILES || depth > MAX_DEPTH) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (files.length >= MAX_FILES) return;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        walk(full, depth + 1);
        continue;
      }
      if (entry.isFile()) files.push(full);
    }
  };

  walk(root, 0);
  cache = { root, at: now, files };
  return files;
}

// Alt dizi eşleşmesi: sorgunun harfleri sırayla geçmeli. Ardışık harfler ve yol
// parçası başları daha değerli, kısa yollar hafif önde.
function fuzzyScore(text: string, query: string): number {
  let score = 0;
  let at = 0;
  let streak = 0;
  for (const char of query) {
    const found = text.indexOf(char, at);
    if (found === -1) return -1;
    streak = found === at ? streak + 1 : 0;
    const boundary = found === 0 || text[found - 1] === "/" || text[found - 1] === "." ? 4 : 0;
    score += 1 + streak + boundary;
    at = found + 1;
  }
  return score - text.length * 0.01;
}

export function fuzzyFiles(files: string[], root: string, query: string, limit = 30): string[] {
  const scored: { rel: string; score: number }[] = [];
  for (const file of files) {
    const rel = path.relative(root, file).split(path.sep).join("/");
    const score = query ? fuzzyScore(rel.toLowerCase(), query.toLowerCase()) : 0;
    if (score < 0) continue;
    scored.push({ rel, score });
  }
  scored.sort((a, b) => b.score - a.score || a.rel.length - b.rel.length);
  return scored.slice(0, limit).map((entry) => entry.rel);
}
