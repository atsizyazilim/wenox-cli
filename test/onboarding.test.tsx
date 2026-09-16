import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";

process.env.WENOX_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "wenox-onb-"));
process.env.FORCE_COLOR = "3";
process.env.WENOX_LANG = "tr";

const { render } = await import("ink-testing-library");
const stripAnsi = (await import("strip-ansi")).default;
const { Onboarding } = await import("../src/tui/screens/onboarding.js");
const { setLocale } = await import("../src/i18n/index.js");

const d = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
const plain = (s: string | null | undefined): string => stripAnsi(s ?? "");

test("onboarding akışı: dil → anahtar → doğrulama → karşılama", async () => {
  setLocale("tr");
  globalThis.fetch = (async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      name: "Test Kullanıcı",
      premium: true,
      premium_days_remaining: 5,
      credits_remaining: 120,
    }),
  })) as unknown as typeof fetch;

  let completed: string | null = null;
  const ui = render(
    <Onboarding
      onComplete={(key) => {
        completed = key;
      }}
    />,
  );
  await d(150);

  let out = plain(ui.lastFrame());
  assert.ok(out.includes("Arayüz dili"), "dil adımı görünür");
  assert.ok(out.includes("Türkçe") && out.includes("English"), "iki dil listelenir");

  ui.stdin.write("\r");
  await d(150);
  out = plain(ui.lastFrame());
  assert.ok(out.includes("me.wenox.co/api-key"), "anahtar bağlantısı görünür");

  ui.stdin.write("wx-test");
  await d(80);
  assert.ok(plain(ui.lastFrame()).includes("wx-test"), "yazılan anahtar görünür");

  ui.stdin.write("\r");
  await d(1200);
  out = plain(ui.lastFrame());
  assert.ok(out.includes("Merhaba"), "daktilo karşılaması başlar");
  assert.ok(!out.includes("me.wenox.co/api-key"), "anahtar adımından çıkıldı");

  ui.stdin.write("\r");
  await d(80);
  assert.equal(completed, "wx-test", "onComplete anahtarla çağrılır");
  ui.unmount();
});

test("fare olayı dizileri input'a sızmaz", async () => {
  setLocale("tr");
  const ui = render(<Onboarding onComplete={() => {}} />);
  await d(150);
  ui.stdin.write("\r"); // apikey adımına geç
  await d(150);

  ui.stdin.write("[<0;69;19M");
  await d(60);
  ui.stdin.write("[<32;69;19M");
  await d(60);
  assert.ok(!plain(ui.lastFrame()).includes("[<"), "fare dizisi görünmemeli");

  ui.stdin.write("wx-abc");
  await d(80);
  assert.ok(plain(ui.lastFrame()).includes("wx-abc"), "sonrasında yazı yazılabilmeli");
  ui.unmount();
});
