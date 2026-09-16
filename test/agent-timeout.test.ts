import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import type OpenAI from "openai";

process.env.WENOX_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "wenox-timeout-"));
process.env.WENOX_REQUEST_TIMEOUT_MS = "200";

const { WenOXAgent } = await import("../src/agent.js");
import type { Sink } from "../src/sink.js";

function silentSink(extra: Sink = {}): Sink {
  return {
    thinking: () => {},
    assistantUpdate: () => {},
    assistantClear: () => {},
    toolCall: () => {},
    toolResult: () => {},
    info: () => {},
    error: () => {},
    ...extra,
  };
}

test("yanıt gelmezse istek zaman aşımına uğrar", async () => {
  const agent = new WenOXAgent({ apiKey: "k" });
  agent.client = {
    chat: {
      completions: {
        create: async () =>
          (async function* () {
            await new Promise((resolve) => setTimeout(resolve, 400));
          })(),
      },
    },
  } as unknown as OpenAI;

  const errors: string[] = [];
  await agent.chatStep(
    "selam",
    silentSink({
      error: (text: string) => {
        errors.push(text);
      },
    }),
  );
  assert.ok(
    errors.some((line) => /timed out/i.test(line)),
    `timeout hatası beklenirdi: ${errors.join(" | ")}`,
  );
});

test("compact iptal edilebilir bir istek kullanır", async () => {
  const agent = new WenOXAgent({ apiKey: "k" });
  agent.messages.push({ role: "user", content: "merhaba" });
  agent.messages.push({ role: "assistant", content: "selam" });

  let sawSignal = false;
  agent.client = {
    chat: {
      completions: {
        create: async (_params: unknown, options?: { signal?: unknown }) => {
          sawSignal = Boolean(options?.signal);
          return { choices: [{ message: { content: "kisa ozet" } }] };
        },
      },
    },
  } as unknown as OpenAI;

  const result = await agent.compact();
  assert.equal(sawSignal, true, "compact isteğine AbortSignal geçilmeli");
  assert.equal(result.summary, "kisa ozet");
  assert.ok(result.tokens > 0);
});
