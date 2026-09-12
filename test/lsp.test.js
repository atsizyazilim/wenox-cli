import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";

process.env.WENOX_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "wenox-lsp-"));
const { serverFor, codeIntel } = await import("../src/lsp.js");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wenox-lsp-work-"));

test("serverFor uzantıya göre sunucu seçer", () => {
  assert.equal(serverFor("a.ts").command, "typescript-language-server");
  assert.equal(serverFor("a.js").command, "typescript-language-server");
  assert.equal(serverFor("a.py").command, "pyright-langserver");
  assert.equal(serverFor("a.go").command, "gopls");
  assert.equal(serverFor("a.rs").command, "rust-analyzer");
  assert.equal(serverFor("a.txt"), null);
});

test("bilinmeyen işlem hata verir", async () => {
  const r = await codeIntel({ operation: "patlat", path: "a.ts" });
  assert.equal(r.success, false);
  assert.match(r.error, /unknown operation/i);
});

test("desteklenmeyen uzantıda nazik hata", async () => {
  const file = path.join(dir, "notlar.txt");
  fs.writeFileSync(file, "içerik", "utf8");
  const r = await codeIntel({ operation: "symbols", path: file });
  assert.equal(r.success, false);
  assert.match(r.error, /no language server/i);
});

test("olmayan dosyada hata", async () => {
  const r = await codeIntel({ operation: "symbols", path: path.join(dir, "yok.ts") });
  assert.equal(r.success, false);
  assert.match(r.error, /not found/i);
});

test("konum gerektiren işlemde line/character zorunlu", async () => {
  const file = path.join(dir, "kod.ts");
  fs.writeFileSync(file, "const x = 1;\n", "utf8");
  const r = await codeIntel({ operation: "definition", path: file });
  assert.equal(r.success, false);
  assert.match(r.error, /line.*character/i);
});

test("code_intel araç şemasında İngilizce tanımlı", async () => {
  const tools = await import("../src/tools.js");
  const entry = tools.TOOLS_SCHEMA.find((t) => t.function.name === "code_intel");
  assert.ok(entry, "code_intel şemada olmalı");
  assert.match(entry.function.description, /language server/i);
  assert.equal(/[çğıöşüÇĞİÖŞÜ]/.test(JSON.stringify(entry)), false);
});
