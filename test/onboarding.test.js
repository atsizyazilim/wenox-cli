import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";

process.env.WENOX_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "wenox-onb-"));
process.env.FORCE_COLOR = "3";
process.env.WENOX_LANG = "tr";

const { html } = await import("htm/react");
const { render } = await import("ink-testing-library");
const stripAnsi = (await import("strip-ansi")).default;
const { Onboarding } = await import("../src/tui/screens/onboarding.js");
const { setLocale } = await import("../src/i18n/index.js");

const d = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const plain = (s) => stripAnsi(s ?? "");

test("onboarding akışı: dil → anahtar → doğrulama → karşılama", async () => {
  setLocale("tr");
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ name: "Test Kullanıcı", premium: true, premium_days_remaining: 5, credits_remaining: 120 }),
  });

  let completed = null;
  const ui = render(html`<${Onboarding} onComplete=${(key) => { completed = key; }} />`);
  await d(150);

  let frame = plain(ui.lastFrame());
  assert.ok(frame.includes("Arayüz dili"), "dil adımı görünür");
  assert.ok(frame.includes("Türkçe") && frame.includes("English"), "iki dil listelenir");

  ui.stdin.write("\r");
  await d(150);
  frame = plain(ui.lastFrame());
  assert.ok(frame.includes("me.wenox.co/api-key"), "anahtar bağlantısı görünür");

  ui.stdin.write("wx-test");
  await d(80);
  assert.ok(plain(ui.lastFrame()).includes("wx-test"), "yazılan anahtar görünür");

  ui.stdin.write("\r");
  await d(1200);
  frame = plain(ui.lastFrame());
  assert.ok(frame.includes("Merhaba"), "daktilo karşılaması başlar");
  assert.ok(!frame.includes("me.wenox.co/api-key"), "anahtar adımından çıkıldı");

  ui.stdin.write("\r");
  await d(80);
  assert.equal(completed, "wx-test", "onComplete anahtarla çağrılır");
  ui.unmount();
});

test("fare olayı dizileri input'a sızmaz", async () => {
  setLocale("tr");
  const ui = render(html`<${Onboarding} onComplete=${() => {}} />`);
  await d(150);
  ui.stdin.write("\r"); // apikey adımına geç
  await d(150);

  ui.stdin.write("[<0;69;19M");
  await d(60);
  ui.stdin.write("[<32;69;19M");
  await d(60);
  assert.ok(!plain(ui.lastFrame()).includes("[<"), "fare dizisi görünmemeli");

  ui.stdin.write("wx-abc");
  await d(80);
  assert.ok(plain(ui.lastFrame()).includes("wx-abc"), "sonrasında yazı yazılabilmeli");
  ui.unmount();
});
