import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";

process.env.WENOX_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "wenox-agent-"));
const { WenOXAgent } = await import("../src/agent.js");

function streamOf(chunks) {
  return (async function* () {
    for (const chunk of chunks) yield chunk;
  })();
}

function toolCallChunk(name, args) {
  return {
    choices: [
      {
        delta: {
          tool_calls: [
            { index: 0, id: "call_1", function: { name, arguments: JSON.stringify(args) } },
          ],
        },
      },
    ],
  };
}

function makeAgent(firstChunk) {
  const agent = new WenOXAgent({ apiKey: "test" });
  let call = 0;
  agent.client = {
    chat: {
      completions: {
        create: async () =>
          call++ === 0
            ? streamOf([firstChunk])
            : streamOf([{ choices: [{ delta: { content: "bitti" } }] }]),
      },
    },
  };
  return agent;
}

const OUTSIDE = path.join("..", "..", `wenox-outside-${process.pid}`);

test("proje dışı yol izin ister, reddedilirse araç çalışmaz", async () => {
  const agent = makeAgent(toolCallChunk("list_dir", { path: OUTSIDE }));
  const asked = [];
  const results = [];
  await agent.chatStep("t", {
    askPermission: async (info) => {
      asked.push(info);
      return "reject";
    },
    toolResult: (_name, result) => results.push(result),
  });
  assert.equal(asked.length, 1);
  assert.match(asked[0].pattern, /\*$/);
  assert.equal(results[0].success, false);
  assert.match(results[0].error, /denied/i);
});

test("proje içi yol izin istemez", async () => {
  const inside = path.join(process.cwd(), "package.json");
  const agent = makeAgent(toolCallChunk("read_file", { path: inside }));
  let asked = 0;
  await agent.chatStep("t", {
    askPermission: async () => {
      asked += 1;
      return "reject";
    },
    toolResult: () => {},
  });
  assert.equal(asked, 0);
});

test("'always' seçilince izin kalıcı kaydedilir", async () => {
  const agent = makeAgent(toolCallChunk("list_dir", { path: OUTSIDE }));
  let asked = 0;
  await agent.chatStep("t", {
    askPermission: async () => {
      asked += 1;
      return "always";
    },
    toolResult: () => {},
  });
  assert.equal(asked, 1);
  assert.equal(agent.allowedExternal.size, 1);
  const { loadGrants } = await import("../src/permissions.js");
  assert.ok(loadGrants(process.cwd()).length >= 1, "izin diske yazılmalı");
});

test("yeni ajan diskteki izinleri yükler", async () => {
  const { addGrant } = await import("../src/permissions.js");
  addGrant(process.cwd(), "C:\\persisted\\dir");
  const agent = new WenOXAgent({ apiKey: "k" });
  assert.ok(agent.allowedExternal.has("C:\\persisted\\dir"));
});

test("'once' seçilince kalıcı izin eklenmez", async () => {
  const agent = makeAgent(toolCallChunk("list_dir", { path: OUTSIDE }));
  const before = agent.allowedExternal.size;
  await agent.chatStep("t", {
    askPermission: async () => "once",
    toolResult: () => {},
  });
  assert.equal(agent.allowedExternal.size, before);
});

test("system prompt İngilizce ve dil talimatı içerir", () => {
  const agent = new WenOXAgent({ apiKey: "k" });
  const sys = agent.messages[0].content;
  assert.match(sys, /Always respond in the same language the user writes in/);
  assert.match(sys, /You are WenOX AI/);
});

test("setMode system prompt'u Build/Plan arasında günceller", () => {
  const agent = new WenOXAgent({ apiKey: "k" });
  assert.match(agent.messages[0].content, /MODE: BUILD/);
  agent.setMode("plan");
  assert.match(agent.messages[0].content, /MODE: PLAN/);
  assert.equal(agent.mode, "plan");
  agent.setMode("build");
  assert.match(agent.messages[0].content, /MODE: BUILD/);
});

test("plan modunda yazma/komut engellenir", async () => {
  const target = path.join(process.cwd(), "plan-block-test.txt");
  const agent = makeAgent(toolCallChunk("write_file", { path: target, content: "x" }));
  agent.setMode("plan");
  const results = [];
  await agent.chatStep("t", { toolResult: (_name, result) => results.push(result) });
  assert.equal(results[0].success, false);
  assert.match(results[0].error, /plan mode/i);
  assert.equal(fs.existsSync(target), false, "dosya yazılmamalıydı");
});

test("boş anahtarla ajan kurulabilir (istemci tembel kurulur)", () => {
  const agent = new WenOXAgent({ apiKey: "" });
  assert.equal(agent.apiKey, "");
  agent.setApiKey("wx-test");
  assert.ok(agent.client, "anahtar verilince istemci oluşur");
});

test("compact boş geçmişte {summary,tokens} döner", async () => {
  const agent = new WenOXAgent({ apiKey: "k" });
  const result = await agent.compact();
  assert.deepEqual(result, { summary: "", tokens: 0 });
});
