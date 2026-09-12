import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";

process.env.WENOX_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "wenox-i18n-"));

const tr = (await import("../src/i18n/tr.js")).default;
const en = (await import("../src/i18n/en.js")).default;
const i18n = await import("../src/i18n/index.js");

const keyPaths = (obj, prefix = "") =>
  Object.entries(obj).flatMap(([key, value]) =>
    typeof value === "object" && !Array.isArray(value)
      ? keyPaths(value, `${prefix}${key}.`)
      : [`${prefix}${key}`],
  );

test("tr ve en aynı anahtar kümesine sahip", () => {
  const ktr = keyPaths(tr).sort();
  const ken = keyPaths(en).sort();
  assert.deepEqual(ktr, ken);
});

test("normalizeLanguage 2 harfe indirger, desteklenmeyeni null yapar", () => {
  assert.equal(i18n.normalizeLanguage("tr-TR"), "tr");
  assert.equal(i18n.normalizeLanguage("EN-us"), "en");
  assert.equal(i18n.normalizeLanguage("de-DE"), null);
  assert.equal(i18n.normalizeLanguage(""), null);
  assert.equal(i18n.normalizeLanguage(undefined), null);
});

test("t() interpolasyon yapar", () => {
  i18n.setLocale("en");
  assert.equal(i18n.t("agent.thinking", { model: "X" }), "X is thinking...");
  i18n.setLocale("tr");
  assert.equal(i18n.t("agent.thinking", { model: "X" }), "X düşünüyor...");
});

test("bilinmeyen anahtar anahtarın kendisini döndürür", () => {
  assert.equal(i18n.t("yok.boyle.bir.sey"), "yok.boyle.bir.sey");
});

test("localeTag dile göre değişir", () => {
  i18n.setLocale("tr");
  assert.equal(i18n.localeTag(), "tr-TR");
  i18n.setLocale("en");
  assert.equal(i18n.localeTag(), "en-US");
});

test("detectLanguage WENOX_LANG en yüksek öncelik", () => {
  const prev = process.env.WENOX_LANG;
  process.env.WENOX_LANG = "en";
  assert.equal(i18n.detectLanguage("tr"), "en");
  if (prev === undefined) delete process.env.WENOX_LANG;
  else process.env.WENOX_LANG = prev;
});

test("geçersiz setLocale mevcut dili korur", () => {
  i18n.setLocale("tr");
  i18n.setLocale("xx");
  assert.equal(i18n.getLocale(), "tr");
});

test("dizi değerleri interpolasyon yapılmadan döner", () => {
  const items = i18n.t("help.commandRows");
  assert.ok(Array.isArray(items));
  assert.ok(items.length > 0);
});
