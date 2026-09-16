import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import assert from "node:assert/strict";

const { findPackageJson, openUrl, resolvePath, truncate, formatBytes } = await import(
  "../src/utils.js"
);

// Test dosyasının kendi konumundan türetilir; process.cwd() kullanılırsa sonuç
// testin nereden çalıştırıldığına göre değişir.
const here = path.dirname(fileURLToPath(import.meta.url));

test("findPackageJson derinlikten bağımsız olarak aynı manifesti bulur", () => {
  const fromHere = findPackageJson(here, "@wenox/cli");
  const fromDeep = findPackageJson(path.join(here, "a", "b", "c"), "@wenox/cli");
  assert.ok(fromHere, "manifest bulunmalı");
  assert.equal(fromDeep, fromHere);
  assert.equal(JSON.parse(fs.readFileSync(fromHere, "utf8")).name, "@wenox/cli");
});

test("findPackageJson isim eşleşmezse yukarı devam eder, bulamazsa null döner", () => {
  assert.equal(findPackageJson(here, "boyle-bir-paket-yok"), null);
});

test("openUrl yalnızca http(s) kabul eder (komut enjeksiyonu engeli)", () => {
  assert.equal(openUrl("file:///etc/passwd"), false);
  assert.equal(openUrl("javascript:alert(1)"), false);
  assert.equal(openUrl("cmd /c calc"), false);
  assert.equal(openUrl(""), false);
  assert.equal(openUrl(null), false);
});

test("resolvePath ~ ve göreli yolları çözer", () => {
  const rel = resolvePath("src/index.js");
  assert.ok(rel.startsWith(process.cwd()));
  assert.ok(resolvePath("~/x").length > 0);
});

test("truncate ve formatBytes", () => {
  assert.equal(truncate("abcdef", 4), "abc…");
  assert.equal(truncate("abc", 5), "abc");
  assert.equal(formatBytes(0), "0 B");
  assert.match(formatBytes(2048), /KB$/);
});
