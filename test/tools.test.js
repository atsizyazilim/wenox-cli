import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";

process.env.WENOX_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "wenox-tools-"));
const tools = await import("../src/tools.js");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wenox-work-"));

test("write_file + read_file satır numaralı okur", () => {
  const p = path.join(dir, "a.txt");
  const w = tools.writeFile(p, "l1\nl2\nl3");
  assert.equal(w.success, true);
  const r = tools.readFile(p);
  assert.equal(r.success, true);
  assert.equal(r.total_lines, 3);
  assert.match(r.content, /1 \| l1/);
  assert.match(r.content, /3 \| l3/);
});

test("read_file olmayan dosyada nazik hata", () => {
  const r = tools.readFile(path.join(dir, "yok.txt"));
  assert.equal(r.success, false);
  assert.match(r.error, /not found/i);
});

test("read_file start_line/end_line aralığı", () => {
  const p = path.join(dir, "range.txt");
  tools.writeFile(p, Array.from({ length: 10 }, (_, i) => `satir${i + 1}`).join("\n"));
  const r = tools.readFile(p, 3, 5);
  assert.equal(r.success, true);
  assert.equal(r.viewing_range, "3-5");
  assert.match(r.content, /3 \| satir3/);
});

test("edit_file tekil eşleşmeyi değiştirir ve diff döner", () => {
  const p = path.join(dir, "b.txt");
  tools.writeFile(p, "foo\nbar\nbaz\n");
  const r = tools.editFile(p, "bar", "BAR");
  assert.equal(r.success, true);
  assert.ok(r.diff.includes("BAR"));
  assert.equal(fs.readFileSync(p, "utf8"), "foo\nBAR\nbaz\n");
});

test("edit_file çoklu eşleşmede hata verir", () => {
  const p = path.join(dir, "c.txt");
  tools.writeFile(p, "x\nx\n");
  const r = tools.editFile(p, "x", "y");
  assert.equal(r.success, false);
});

test("list_dir ve search_code", () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "wenox-list-"));
  fs.mkdirSync(path.join(base, "sub"), { recursive: true });
  tools.writeFile(path.join(base, "sub", "z.txt"), "needle here\n");
  const list = tools.listDir(base, 2);
  assert.equal(list.success, true);
  assert.ok(list.total_items >= 1);
  const search = tools.searchCode("needle", base, false);
  assert.equal(search.success, true);
  assert.ok(search.match_count >= 1);
});

test("search_code boş sorguda hata verir", () => {
  const r = tools.searchCode("", dir, false);
  assert.equal(r.success, false);
});

test("run_command çıktı ve çıkış kodu döner", async () => {
  const r = await tools.runCommand("node --version");
  assert.equal(r.success, true);
  assert.match(r.stdout, /v\d+\./);
});

test("executeTool bilinmeyen araçta hata döner", async () => {
  const r = await tools.executeTool("boyle_bir_arac_yok");
  assert.equal(r.success, false);
  assert.match(r.error, /unknown tool/i);
});

test("araç şeması İngilizce — Türkçe karakter içermez", () => {
  const json = JSON.stringify(tools.TOOLS_SCHEMA);
  assert.equal(/[çğıöşüÇĞİÖŞÜ]/.test(json), false);
});

test("araç şeması beklenen araçları içerir", () => {
  const names = tools.TOOLS_SCHEMA.map((t) => t.function.name);
  for (const name of ["read_file", "write_file", "edit_file", "list_dir", "search_code", "run_command", "ask_user"]) {
    assert.ok(names.includes(name), `${name} eksik`);
  }
});
