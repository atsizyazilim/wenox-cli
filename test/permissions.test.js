import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";

const home = fs.mkdtempSync(path.join(os.tmpdir(), "wenox-perm-"));
process.env.WENOX_HOME = home;
const { loadGrants, addGrant } = await import("../src/permissions.js");

test("grant proje bazında saklanır ve yüklenir", () => {
  addGrant("C:\\proj\\a", "C:\\ext\\x");
  addGrant("C:\\proj\\a", "C:\\ext\\y");
  addGrant("C:\\proj\\b", "D:\\other");
  assert.deepEqual(loadGrants("C:\\proj\\a").sort(), ["C:\\ext\\x", "C:\\ext\\y"]);
  assert.deepEqual(loadGrants("C:\\proj\\b"), ["D:\\other"]);
  assert.deepEqual(loadGrants("C:\\proj\\yok"), []);
});

test("aynı grant tekrar eklenince çoğalmaz", () => {
  addGrant("C:\\proj\\a", "C:\\ext\\x");
  const hits = loadGrants("C:\\proj\\a").filter((entry) => entry === "C:\\ext\\x");
  assert.equal(hits.length, 1);
});

test("boş girdiler yok sayılır", () => {
  addGrant("", "C:\\x");
  addGrant("C:\\proj\\a", "");
  assert.deepEqual(loadGrants(""), []);
});

test("geçerli JSON projeleri korur", () => {
  const file = path.join(home, "permissions.json");
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  assert.equal(typeof data.projects, "object");
});

// en sonda: dosyayı bozar, sonrasında okuyan test olmamalı
test("bozuk dosya çökmeden boş döner", () => {
  fs.writeFileSync(path.join(home, "permissions.json"), "{bozuk json", "utf8");
  assert.deepEqual(loadGrants("C:\\proj\\a"), []);
});
