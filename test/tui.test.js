import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";

process.env.WENOX_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "wenox-tui-"));
process.env.FORCE_COLOR = "3";

const { html } = await import("htm/react");
const { render } = await import("ink-testing-library");
const stripAnsi = (await import("strip-ansi")).default;
const { App } = await import("../src/tui/app.js");
const { Permission } = await import("../src/tui/components/permission.js");
const { setLocale } = await import("../src/i18n/index.js");

const d = (ms) => new Promise((r) => setTimeout(r, ms));
const plain = (s) => stripAnsi(s ?? "");

const agent = {
  apiKey: "",
  modelId: "grok-4.6",
  messages: [{ role: "system", content: "s" }],
  messageCount: 0,
  client: { models: { list: async () => ({ data: [] }) } },
  setModel() {},
  clearHistory() {},
  updateCwd() {},
  setApiKey() {},
  setMode() {},
  async chatStep() {},
  async compact() {
    return { summary: "", tokens: 0 };
  },
  async generateTitle() {
    return "";
  },
};

async function frame(locale, actions) {
  setLocale(locale);
  const ui = render(html`<${App} agent=${agent} version="0.1.1" initialModelId="grok-4.6" />`);
  await d(140);
  await actions?.(ui);
  const out = plain(ui.lastFrame());
  ui.unmount();
  return out;
}

test("durum çubuğu TR/EN yerelleşir", async () => {
  const en = await frame("en");
  assert.ok(en.includes("commands") && !en.includes("komutlar"));
  const tr = await frame("tr");
  assert.ok(tr.includes("komutlar"));
});

test("slash menüsü seçili dilde komut açıklaması gösterir", async () => {
  const en = await frame("en", async (ui) => {
    ui.stdin.write("/");
    await d(90);
  });
  assert.ok(en.includes("change model"));
  const tr = await frame("tr", async (ui) => {
    ui.stdin.write("/");
    await d(90);
  });
  assert.ok(tr.includes("modeli değiştir"));
});

test("permission paneli TR + seçim okunur", async () => {
  setLocale("tr");
  const ui = render(
    html`<${Permission} path="C:\\x\\y" pattern="C:\\x\\y\\*" choice=${0} />`,
  );
  await d(90);
  const f = plain(ui.lastFrame());
  assert.ok(f.includes("İzin gerekli"));
  assert.ok(f.includes("Bir kez izin ver"));
  assert.ok(f.includes("Her zaman izin ver") && f.includes("Reddet"));
  assert.match(ui.lastFrame(), /48;2;224;160;101/, "seçili seçenek amber zeminli olmalı");
  ui.unmount();
});

test("/lang ile canlı dil değişimi", async () => {
  const out = await frame("en", async (ui) => {
    ui.stdin.write("/lang");
    await d(90);
    ui.stdin.write("\r");
    await d(140);
    ui.stdin.write("\r");
    await d(180);
  });
  assert.ok(out.includes("komutlar"), "dil TR'ye geçmeliydi");
});

test("Tab mod değiştirir, model listesi açılmaz", async () => {
  setLocale("en");
  const modeAgent = {
    ...agent,
    mode: "build",
    setMode(value) {
      modeAgent.mode = value;
    },
  };
  const ui = render(html`<${App} agent=${modeAgent} version="0.1.1" initialModelId="grok-4.6" />`);
  await d(150);
  assert.ok(plain(ui.lastFrame()).includes("Build"), "başlangıç Build");

  ui.stdin.write("\t");
  await d(90);
  const f = plain(ui.lastFrame());
  assert.ok(f.includes("Plan"), "Tab sonrası Plan olmalı");
  assert.ok(!f.includes("Enter select"), "model menüsü açılmamalı");
  assert.equal(modeAgent.mode, "plan");

  ui.stdin.write("\t");
  await d(90);
  assert.ok(plain(ui.lastFrame()).includes("Build"), "tekrar Tab -> Build");
  ui.unmount();
});

test("onay paneli Allow/Disallow içerir", async () => {
  setLocale("en");
  const { Approval } = await import("../src/tui/components/approval.js");
  const ui = render(html`<${Approval} command="node -v" allow=${true} />`);
  await d(80);
  const f = plain(ui.lastFrame());
  assert.ok(f.includes("Allow") && f.includes("Disallow"));
  ui.unmount();
});
