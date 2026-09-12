import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";

process.env.WENOX_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "wenox-view-"));
const { buildTranscript } = await import("../src/tui/view.js");
const { setLocale } = await import("../src/i18n/index.js");

const plain = (line) => String(line).replace(/\[[0-9;]*m/g, "");
const textOf = (items, width = 60) => buildTranscript(items, width).lines.map(plain).join("\n");

function commandItems(stdout = "", extra = {}) {
  return [
    { id: 1, role: "tool-call", name: "run_command", args: { command: "node --version" } },
    {
      id: 2,
      role: "tool-result",
      name: "run_command",
      result: { success: true, returncode: 0, stdout, stderr: "", ...extra },
      ...(extra.expanded ? { expanded: true } : {}),
    },
  ];
}

test("run_command komutu ve çıktısı transkriptte görünür", () => {
  setLocale("tr");
  const text = textOf(commandItems("v22.22.3\n"));
  assert.match(text, /\$ node --version/);
  assert.match(text, /v22\.22\.3/);
});

test("başarısız komutta stderr ve çıkış kodu görünür", () => {
  setLocale("tr");
  const text = textOf(commandItems("", { returncode: 1, stderr: "hata: foo" }));
  assert.match(text, /hata: foo/);
  assert.match(text, /çıkış kodu 1/);
});

test("çıktısız komutta '(çıktı yok)' gösterilir", () => {
  setLocale("tr");
  assert.match(textOf(commandItems("")), /\(çıktı yok\)/);
});

test("uzun çıktı kısaltılır, öğe expanded ise tamamı görünür", () => {
  setLocale("tr");
  const out = Array.from({ length: 20 }, (_, i) => `satir ${i + 1}`).join("\n");

  const collapsed = textOf(commandItems(out));
  assert.match(collapsed, /satir 6/);
  assert.doesNotMatch(collapsed, /satir 7/);
  assert.match(collapsed, /genişletmek için tıkla/);

  const items = commandItems(out);
  items[1].expanded = true;
  const expanded = textOf(items);
  assert.match(expanded, /satir 20/);
  assert.match(expanded, /daraltmak için tıkla/);
});

test("owners her satır için öğe id'si verir", () => {
  setLocale("tr");
  const { lines, owners } = buildTranscript(commandItems("bir\niki\n"), 60);
  assert.equal(lines.length, owners.length);
  assert.ok(owners.includes(1), "tool-call satırları 1. öğeye ait");
  assert.ok(owners.includes(2), "tool-result satırları 2. öğeye ait");
});
