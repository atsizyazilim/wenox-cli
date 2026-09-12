import { test } from "node:test";
import assert from "node:assert/strict";

const { openUrl, resolvePath, truncate, formatBytes } = await import("../src/utils.js");

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
