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
