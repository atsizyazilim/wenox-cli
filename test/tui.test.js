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
    mode: "plan",
    setMode(value) {
      modeAgent.mode = value;
    },
  };
  const ui = render(html`<${App} agent=${modeAgent} version="0.1.1" initialModelId="grok-4.6" />`);
  await d(150);
  assert.ok(plain(ui.lastFrame()).includes("Plan"), "başlangıç Plan");

  ui.stdin.write("\t");
  await d(90);
  const f = plain(ui.lastFrame());
  assert.ok(f.includes("Build"), "Tab sonrası Build olmalı");
  assert.ok(!f.includes("Enter select"), "model menüsü açılmamalı");
  assert.equal(modeAgent.mode, "build");

  ui.stdin.write("\t");
  await d(90);
  assert.ok(plain(ui.lastFrame()).includes("Plan"), "tekrar Tab -> Plan");
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

test("güvensiz dizinde (ev dizini) uyarı gösterilir", async () => {
  setLocale("tr");
  const original = process.cwd();
  process.chdir(os.homedir());
  const ui = render(html`<${App} agent=${agent} version="0.1.1" initialModelId="grok-4.6" />`);
  try {
    await d(250);
    assert.ok(
      plain(ui.lastFrame()).includes("proje dizininde değilsin"),
      "proje dizini uyarısı görünür",
    );
  } finally {
    ui.unmount();
    process.chdir(original);
  }
});

test("/exit oturum içeriğini senkronlar (komutla çıkışta id verilir)", async () => {
  setLocale("tr");
  const session = {
    id: "ses_exit",
    title: "",
    cwd: process.cwd(),
    model: "grok-4.6",
    tokens: 0,
    messages: [],
    items: [],
  };
  const ui = render(html`<${App} agent=${agent} version="0.1.1" initialModelId="grok-4.6" session=${session} />`);
  await d(150);
  ui.stdin.write("/help");
  await d(60);
  ui.stdin.write("\r");
  await d(200);
  ui.stdin.write("/exit");
  await d(60);
  ui.stdin.write("\r");
  await d(250);
  ui.unmount();
  await d(50);
  assert.ok(session.items.length > 0, "çıkışta oturum içeriği yazılmalı (aksi halde id gösterilmez)");
});

test("/key anahtarı doğrulayarak günceller", async () => {
  setLocale("en");
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ name: "Ali", credits_remaining: 5 }),
  });
  const ui = render(html`<${App} agent=${agent} version="0.1.1" initialModelId="grok-4.6" />`);
  await d(150);
  ui.stdin.write("/key");
  await d(80);
  ui.stdin.write("\r");
  await d(120);
  ui.stdin.write("wx-good");
  await d(80);
  ui.stdin.write("\r");
  await d(300);
  const f = plain(ui.lastFrame());
  assert.ok(f.includes("API key updated"), "güncellendi mesajı görünür");
  assert.ok(f.includes("Signed in as Ali"), "hesap adı gösterilir");
  ui.unmount();
});

test("/key geçersiz anahtarı kaydetmez", async () => {
  setLocale("en");
  globalThis.fetch = async () => ({ ok: false, status: 401, json: async () => ({}) });
  const ui = render(html`<${App} agent=${agent} version="0.1.1" initialModelId="grok-4.6" />`);
  await d(150);
  ui.stdin.write("/key");
  await d(80);
  ui.stdin.write("\r");
  await d(120);
  ui.stdin.write("wx-bad");
  await d(80);
  ui.stdin.write("\r");
  await d(300);
  const f = plain(ui.lastFrame());
  assert.ok(f.includes("Invalid API key"), "geçersiz mesajı görünür");
  assert.ok(!f.includes("API key updated"), "kaydedilmemeli");
  ui.unmount();
});
