// SPDX-FileCopyrightText: 2026 Hari Srinivasan
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { createServer, type ServerResponse } from "node:http";
import test, { type TestContext } from "node:test";
import { collectModelStream, makeFakeModelInfo, OpenAiResponsesProvider } from "../src/index.ts";

// Each Node test file has its own process. Never send loopback fixtures through an ambient proxy.
process.env.NO_PROXY = [process.env.NO_PROXY, "127.0.0.1"].filter(Boolean).join(",");

const complete = `data: ${JSON.stringify({ type: "response.completed", response: { usage: { input_tokens: 10, output_tokens: 1 } } })}\n\n`;
async function provider(t: TestContext, handle: (response: ServerResponse) => void) {
  const server = createServer((_request, response) => handle(response));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => {
    server.closeAllConnections();
    return new Promise<void>((resolve) => server.close(() => resolve()));
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return new OpenAiResponsesProvider({
    id: "timeout-test",
    displayName: "Timeout test",
    authMethods: ["keyless"],
    models: [makeFakeModelInfo()],
    resolveAuth: async () => ({ auth: {}, source: "test", secretValues: [] }),
    endpoint: {
      url: () => `http://127.0.0.1:${address.port}/responses`,
      headers: () => ({}),
      deploymentFor: (id) => id,
    },
  });
}

test("header inactivity times out without treating uncertain acceptance as retry-safe", async (t) => {
  const model = await provider(t, () => {});
  const { terminal } = await collectModelStream(
    model.stream({ modelId: "fake-model", messages: [], httpIdleTimeoutMs: 40 }),
  );
  assert.equal(terminal.type, "error");
  if (terminal.type === "error") {
    assert.equal(terminal.code, "model_request_idle_timeout");
    assert.equal(terminal.category, "timeout");
    assert.equal(terminal.requestPhase, "awaiting_response");
    assert.equal(terminal.retryable, false);
  }
});

test("body inactivity preserves partial output and is not retry-safe", async (t) => {
  const model = await provider(t, (response) => {
    response.writeHead(200, { "content-type": "text/event-stream" });
    response.write(
      `data: ${JSON.stringify({ type: "response.output_text.delta", delta: "partial" })}\n\n`,
    );
  });
  const { events, terminal } = await collectModelStream(
    model.stream({ modelId: "fake-model", messages: [], httpIdleTimeoutMs: 40 }),
  );
  assert.deepEqual(events[0], { type: "text_delta", text: "partial" });
  assert.equal(terminal.type, "error");
  if (terminal.type === "error") {
    assert.equal(terminal.code, "model_request_idle_timeout");
    assert.equal(terminal.requestPhase, "streaming");
    assert.equal(terminal.retryable, false);
  }
});

test("heartbeat bytes keep a stream alive without visible tokens or an absolute deadline", async (t) => {
  const model = await provider(t, (response) => {
    response.writeHead(200, { "content-type": "text/event-stream" });
    response.write(": first heartbeat\n\n");
    let pulses = 0;
    const timer = setInterval(() => {
      response.write(": heartbeat\n\n");
      if (++pulses === 12) {
        clearInterval(timer);
        response.end(complete);
      }
    }, 15);
    response.once("close", () => clearInterval(timer));
  });
  const { events, terminal } = await collectModelStream(
    model.stream({ modelId: "fake-model", messages: [], httpIdleTimeoutMs: 80 }),
  );
  assert.equal(events.length, 1);
  assert.equal(terminal.type, "completed");
});

test("disabled idle timeout permits delayed headers and user cancellation stays distinct", async (t) => {
  const model = await provider(t, (response) => {
    const timer = setTimeout(() => response.end(complete), 120);
    response.once("close", () => clearTimeout(timer));
  });
  assert.equal(
    (
      await collectModelStream(
        model.stream({ modelId: "fake-model", messages: [], httpIdleTimeoutMs: 0 }),
      )
    ).terminal.type,
    "completed",
  );
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20);
  try {
    const result = await collectModelStream(
      model.stream({
        modelId: "fake-model",
        messages: [],
        httpIdleTimeoutMs: 500,
        signal: controller.signal,
      }),
      controller.signal,
    );
    assert.equal(result.terminal.type, "aborted");
  } finally {
    clearTimeout(timer);
  }
});
