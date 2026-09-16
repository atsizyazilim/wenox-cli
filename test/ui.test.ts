import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";

process.env.WENOX_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "wenox-ui-"));
const { welcomeMessage } = await import("../src/ui.js");
const { setLocale } = await import("../src/i18n/index.js");

test("welcomeMessage isim, abonelik ve krediyi içerir (TR)", () => {
  setLocale("tr");
  const msg = welcomeMessage({
    name: "Mert İlhan",
    premium: true,
    premium_days_remaining: 12,
    credits_remaining: 875,
  });
  assert.match(msg, /Mert İlhan/);
  assert.match(msg, /12/);
  assert.match(msg, /875/);
});

test("welcomeMessage abonelik yoksa farklı satır (EN)", () => {
  setLocale("en");
  const msg = welcomeMessage({ name: "Sam", premium: false, credits_remaining: 3 });
  assert.match(msg, /Sam/);
  assert.match(msg, /don't have an active subscription/);
});

test("welcomeMessage hesap yoksa anonim karşılama", () => {
  setLocale("en");
  assert.match(welcomeMessage(null), /Welcome to WenOX CLI/);
});

test("welcomeMessage gün sayısı yoksa da çalışır", () => {
  setLocale("tr");
  const msg = welcomeMessage({ name: "Ayşe", premium: true });
  assert.match(msg, /Ayşe/);
  assert.match(msg, /aboneliğin var/);
});
