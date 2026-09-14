import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";

process.env.WENOX_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "wenox-update-"));
const { checkForUpdate, fetchLatestVersion, isNewer, updateCacheFile } = await import(
  "../src/update.js"
);

const STALE = 7 * 60 * 60 * 1000;

function stubFetch(impl) {
  const original = globalThis.fetch;
  globalThis.fetch = impl;
  return () => {
    globalThis.fetch = original;
  };
}

function writeCacheFile(latest, checkedAt) {
  fs.writeFileSync(updateCacheFile(), JSON.stringify({ latest, checkedAt }), "utf8");
}

function clearCache() {
  fs.rmSync(updateCacheFile(), { force: true });
}

function readCacheFile() {
  return JSON.parse(fs.readFileSync(updateCacheFile(), "utf8"));
}

test("sürüm karşılaştırması sayısal yapılır", () => {
  assert.equal(isNewer("0.2.0", "0.1.1"), true);
  assert.equal(isNewer("0.1.10", "0.1.9"), true);
  assert.equal(isNewer("1.0.0", "0.9.9"), true);
  assert.equal(isNewer("v0.2.0", "0.1.1"), true);
  assert.equal(isNewer("0.1.1", "0.1.1"), false);
  assert.equal(isNewer("0.1.0", "0.1.1"), false);
});

test("çözümlenemeyen sürüm güncelleme zorlamaz", () => {
  assert.equal(isNewer("latest", "0.1.1"), false);
  assert.equal(isNewer("0.2", "0.1.1"), false);
  assert.equal(isNewer("0.2.0", ""), false);
  assert.equal(isNewer(null, "0.1.1"), false);
});

test("taze önbellek ağa çıkmadan karar verir", async () => {
  clearCache();
  writeCacheFile("0.2.0", Date.now());
  let called = false;
  const restore = stubFetch(async () => {
    called = true;
    return { ok: true, json: async () => ({ version: "0.3.0" }) };
  });

  const result = await checkForUpdate({ current: "0.1.1" });
  restore();

  assert.equal(result.outdated, true);
  assert.equal(result.latest, "0.2.0");
  assert.equal(called, false, "taze önbellekte ağa çıkılmamalı");
});

test("güncel sürümde zorlama yapılmaz", async () => {
  clearCache();
  writeCacheFile("0.1.1", Date.now());
  const restore = stubFetch(async () => {
    throw new Error("ağa çıkılmamalı");
  });

  const result = await checkForUpdate({ current: "0.1.1" });
  restore();

  assert.equal(result.outdated, false);
});

test("bayat önbellek ağdan tazelenir ve zorlar", async () => {
  clearCache();
  writeCacheFile("0.1.1", Date.now() - STALE);
  const restore = stubFetch(async () => ({
    ok: true,
    json: async () => ({ version: "0.2.0" }),
  }));

  const result = await checkForUpdate({ current: "0.1.1" });
  restore();

  assert.equal(result.outdated, true);
  assert.equal(result.latest, "0.2.0");
  assert.equal(readCacheFile().latest, "0.2.0");
});

test("ağ hatasında ve önbellek yokken kullanıcı engellenmez", async () => {
  clearCache();
  const restore = stubFetch(async () => {
    throw new Error("boom");
  });

  const result = await checkForUpdate({ current: "0.1.1" });
  restore();

  assert.equal(result.outdated, false);
  assert.equal(result.unknown, true);
});

test("başarısız deneme damgalanır, ertesi açılış beklemez", async () => {
  clearCache();
  writeCacheFile("0.2.0", Date.now() - STALE);
  let calls = 0;
  const restore = stubFetch(async () => {
    calls += 1;
    throw new Error("boom");
  });

  const first = await checkForUpdate({ current: "0.1.1" });
  const second = await checkForUpdate({ current: "0.1.1" });
  restore();

  assert.equal(first.outdated, true, "son bilinen sürüm hatırlanmalı");
  assert.equal(second.outdated, true);
  assert.equal(calls, 1, "başarısız deneme de damgalanmalı");
});

test("registry hatası güncelleme sayılmaz", async () => {
  clearCache();
  const restore = stubFetch(async () => ({
    ok: false,
    status: 503,
    json: async () => ({}),
  }));

  const result = await checkForUpdate({ current: "0.1.1" });
  restore();

  assert.equal(result.outdated, false);
  assert.equal(result.unknown, true);
});

test("takılan istek zaman aşımıyla kesilir", async () => {
  const restore = stubFetch(
    (_url, options) =>
      new Promise((_resolve, reject) => {
        options.signal.addEventListener("abort", () => reject(new Error("aborted")));
      }),
  );

  const version = await fetchLatestVersion({ timeoutMs: 20 });
  restore();

  assert.equal(version, null);
});

test("WENOX_SKIP_UPDATE_CHECK kontrolü atlar", async () => {
  clearCache();
  writeCacheFile("0.9.9", Date.now());
  let called = false;
  const restore = stubFetch(async () => {
    called = true;
    throw new Error("çağrılmamalı");
  });

  process.env.WENOX_SKIP_UPDATE_CHECK = "1";
  const result = await checkForUpdate({ current: "0.1.1" });
  delete process.env.WENOX_SKIP_UPDATE_CHECK;
  restore();

  assert.equal(result.skipped, true);
  assert.equal(result.outdated, false);
  assert.equal(called, false);
});
