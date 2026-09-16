// Testleri derlenmiş çıktıdan çalıştırır.
//
// Neden ayrı bir betik: `node --test <dizin>` sürümden sürüme değişiyor — Node 20
// dizini kabul ediyor, Node 22 etmiyor (modül sanıp yüklemeye çalışıyor), glob
// desteği de sürüme bağlı. Dosya yollarını açıkça vermek her sürümde çalışır.
//
// İkinci sebep: hiç test bulunamazsa `node --test` 0 koduyla çıkıyor, yani
// sessizce hiçbir şey test etmeden başarılı görünebiliyor. Burada liste boşsa
// hata veriyoruz.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const testDir = path.join(root, "dist", "test");

let files = [];
try {
  files = fs
    .readdirSync(testDir)
    .filter((name) => name.endsWith(".test.js"))
    .sort()
    .map((name) => path.join(testDir, name));
} catch {
  files = [];
}

if (files.length === 0) {
  console.error(`Derlenmiş test dosyası bulunamadı: ${testDir}`);
  console.error("Build çalıştı mı? (npm run build)");
  process.exit(1);
}

const result = spawnSync(process.execPath, ["--test", ...files], {
  cwd: root,
  stdio: "inherit",
});
process.exit(result.status ?? 1);
