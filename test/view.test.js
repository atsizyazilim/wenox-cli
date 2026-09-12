import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";

process.env.WENOX_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "wenox-view-"));
const { buildTranscript } = await import("../src/tui/view.js");
const { setLocale } = await import("../src/i18n/index.js");

const plain = (line) => String(line).replace(/\[[0-9;]*m/g, "");

test("run_command komutu ve çıktısı transkriptte görünür", () => {
  setLocale("tr");
  const items = [
    { id: 1, role: "tool-call", name: "run_command", args: { command: "node --version" } },
    {
      id: 2,
      role: "tool-result",
      name: "run_command",
      result: { success: true, returncode: 0, stdout: "v22.22.3\n", stderr: "" },
    },
  ];
  const text = buildTranscript(items, 60).map(plain).join("\n");
  assert.match(text, /\$ node --version/);
  assert.match(text, /v22\.22\.3/);
});

test("başarısız komutta stderr ve çıkış kodu görünür", () => {
  setLocale("tr");
  const items = [
    { id: 1, role: "tool-call", name: "run_command", args: { command: "npm run build" } },
    {
      id: 2,
      role: "tool-result",
      name: "run_command",
      result: { success: true, returncode: 1, stdout: "", stderr: "hata: foo" },
    },
  ];
  const text = buildTranscript(items, 60).map(plain).join("\n");
  assert.match(text, /hata: foo/);
  assert.match(text, /çıkış kodu 1/);
});

test("uzun komut çıktısı kısaltılır, Ctrl+O ile açılır", () => {
  setLocale("tr");
  const out = Array.from({ length: 20 }, (_, i) => `satir ${i + 1}`).join("\n");
  const items = [
    { id: 1, role: "tool-call", name: "run_command", args: { command: "x" } },
    {
      id: 2,
      role: "tool-result",
      name: "run_command",
      result: { success: true, returncode: 0, stdout: out, stderr: "" },
    },
  ];

  const collapsed = buildTranscript(items, 60).map(plain).join("\n");
  assert.match(collapsed, /satir 6/);
  assert.doesNotMatch(collapsed, /satir 7/);
  assert.match(collapsed, /ctrl\+o ile aç/);

  const expanded = buildTranscript(items, 60, { expanded: true }).map(plain).join("\n");
  assert.match(expanded, /satir 20/);
  assert.match(expanded, /ctrl\+o ile küçült/);
});

test("çıktısız komutta '(çıktı yok)' gösterilir", () => {
  setLocale("tr");
  const items = [
    {
      id: 1,
      role: "tool-result",
      name: "run_command",
      result: { success: true, returncode: 0, stdout: "", stderr: "" },
    },
  ];
  const text = buildTranscript(items, 60).map(plain).join("\n");
  assert.match(text, /\(çıktı yok\)/);
});
