import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";

const { isUnsafeWorkspace } = await import("../src/workspace.js");

test("ev dizini, üstü ve sürücü kökü güvensiz", () => {
  assert.equal(isUnsafeWorkspace(os.homedir()), true, "ev dizini");
  assert.equal(isUnsafeWorkspace(path.dirname(os.homedir())), true, "ev dizininin üstü");
  assert.equal(isUnsafeWorkspace(path.parse(process.cwd()).root), true, "sürücü/fs kökü");
});

test("normal proje dizinleri güvenli", () => {
  assert.equal(isUnsafeWorkspace(process.cwd()), false);
  assert.equal(isUnsafeWorkspace(path.join(os.homedir(), "projelerim", "uygulama")), false);
});

test("sistem klasörleri güvensiz", () => {
  if (process.platform === "win32") {
    assert.equal(isUnsafeWorkspace("C:\\Windows"), true);
    assert.equal(isUnsafeWorkspace("C:\\Program Files"), true);
  } else {
    assert.equal(isUnsafeWorkspace("/etc"), true);
    assert.equal(isUnsafeWorkspace("/usr"), true);
  }
});

test("göreli yol mutlaklaştırılarak değerlendirilir", () => {
  assert.equal(isUnsafeWorkspace("."), isUnsafeWorkspace(process.cwd()));
});
