import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";

process.env.WENOX_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "wenox-account-"));
const { verifyApiKey, verifyFailureMessage } = await import("../src/account.js");
const { setLocale } = await import("../src/i18n/index.js");

function stubFetch(impl) {
  const original = globalThis.fetch;
  globalThis.fetch = impl;
  return () => {
    globalThis.fetch = original;
  };
}

test("geçerli anahtar ok ve hesap döner", async () => {
  const restore = stubFetch(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ name: "Ali", credits_remaining: 10 }),
  }));
  const result = await verifyApiKey("wx-valid");
  assert.equal(result.ok, true);
  assert.equal(result.account.name, "Ali");
  restore();
});

test("401/403 geçersiz sayılır", async () => {
  for (const status of [401, 403]) {
    const restore = stubFetch(async () => ({ ok: false, status, json: async () => ({}) }));
    const result = await verifyApiKey("wx-bad");
    assert.deepEqual(result, { ok: false, reason: "invalid" });
    restore();
  }
});

test("diğer HTTP hataları 'server' nedeni döner", async () => {
  const restore = stubFetch(async () => ({ ok: false, status: 500, json: async () => ({}) }));
  const result = await verifyApiKey("wx-x");
  assert.equal(result.ok, false);
  assert.equal(result.reason, "server");
  restore();
});

test("ağ hatası 'network' nedeni döner", async () => {
  const restore = stubFetch(async () => {
    throw new Error("boom");
  });
  const result = await verifyApiKey("wx-x");
  assert.equal(result.ok, false);
  assert.equal(result.reason, "network");
  restore();
});

test("sunucu hatasında 'geçersiz anahtar' denmez", async () => {
  setLocale("tr");
  const restore = stubFetch(async () => ({ ok: false, status: 503, json: async () => ({}) }));
  const result = await verifyApiKey("wx-x");
  restore();

  assert.equal(result.reason, "server");
  const message = verifyFailureMessage(result.reason);
  assert.match(message, /sunucu/i);
  assert.doesNotMatch(message, /geçersiz/i);
});

test("boş anahtar doğrulanmadan geçersiz", async () => {
  let called = false;
  const restore = stubFetch(async () => {
    called = true;
    return { ok: true, status: 200, json: async () => ({}) };
  });
  const result = await verifyApiKey("   ");
  assert.equal(result.ok, false);
  assert.equal(called, false, "boş anahtar için ağa çıkılmamalı");
  restore();
});
