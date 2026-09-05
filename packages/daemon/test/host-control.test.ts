// SPDX-FileCopyrightText: 2026 Hari Srinivasan
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { type ModelPort, ToolRegistry } from "@axl/kernel";
import type { CanonicalEvent, ModelStreamEvent } from "@axl/protocol";
import { AxlClientError, DaemonHostClient, subscribeSession } from "@axl/sdk";
import { connectUnixClient, createUnixDaemonHost, UnixSocketTransportFactory } from "@axl/sdk/unix";
import { AxlDaemon } from "../src/daemon.ts";

const usage = { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 };
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
const reply: ModelPort = {
  stream: async function* () {
    yield { type: "completed", stopReason: "stop", usage };
  },
};
const code = (expected: string) => (error: unknown) =>
  error instanceof AxlClientError && error.code === expected;

async function until(check: () => Promise<boolean>): Promise<void> {
  for (let i = 0; i < 200; i++) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("Timed out waiting for daemon state");
}

test("host shutdown cancels active work, suppresses queued continuations, drains history, and rejects stale confirmation", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "axl-host-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const socketPath = join(directory, "axl.sock");
  const started = deferred();
  let calls = 0;
  const daemon = new AxlDaemon({
    socketPath,
    dataDirectory: directory,
    runtime: () => ({
      tools: new ToolRegistry(),
      model: {
        stream: async function* (request): AsyncGenerator<ModelStreamEvent> {
          calls++;
          started.resolve();
          if (!request.signal?.aborted)
            await new Promise<void>((resolve) =>
              request.signal?.addEventListener("abort", () => resolve(), { once: true }),
            );
          yield { type: "aborted" };
        },
      },
    }),
  });
  await daemon.start();
  t.after(() => daemon.stop());
  const host = createUnixDaemonHost(socketPath);
  const client = await connectUnixClient(socketPath);
  t.after(() => client.close());
  const session = await client.request("session.create", { cwd: directory });
  const context = { sessionId: session.sessionId, attachmentId: client.connection.attachmentId };
  const events: CanonicalEvent[] = [];
  const subscription = await subscribeSession(client, session.sessionId, {
    onEvent: (event) => {
      events.push(event);
    },
  });
  const sending = client.request("session.send", {
    sessionId: session.sessionId,
    content: [{ type: "text", text: "working" }],
    delivery: "prompt",
  });
  await started.promise;
  await client.request("session.followUp", {
    sessionId: session.sessionId,
    content: [{ type: "text", text: "follow-up" }],
  });
  await client.request("session.queue.enqueue", {
    sessionId: session.sessionId,
    content: [{ type: "text", text: "durable queued prompt" }],
    priority: "back",
  });
  const own = await host.status(context);
  assert.equal(own.busy, true);
  assert.equal(own.confirmationRequired, false);
  assert.equal(own.sessions[0]?.queued, 1);
  await assert.rejects(
    host.shutdown(own, { ...context, interrupt: false, confirmed: false }),
    code("busy"),
  );
  const observer = await connectUnixClient(socketPath);
  t.after(() => observer.close());
  await assert.rejects(
    host.shutdown(own, { ...context, interrupt: true, confirmed: true }),
    code("state_changed"),
  );
  const shared = await host.status(context);
  assert.equal(shared.confirmationRequired, true);
  await assert.rejects(
    host.shutdown(shared, { ...context, interrupt: true, confirmed: false }),
    code("confirmation_required"),
  );
  const disconnected = new Promise<Error>((resolve) => observer.onDisconnect(resolve));
  const stopped = await host.shutdown(shared, { ...context, interrupt: true, confirmed: true });
  assert.equal(stopped.state, "stopped");
  await subscription.close();
  await assert.rejects(
    client.request("session.create", { cwd: directory }),
    code("daemon_stopping"),
  );
  assert.equal((await sending).stopReason, "aborted");
  assert.equal(calls, 1);
  assert.ok(code("daemon_stopping")(await disconnected));
  assert.ok(
    events.some(
      (event) => event.type === "assistant.message" && event.payload.stopReason === "aborted",
    ),
  );
  const history = await readFile(join(directory, "sessions", `${session.sessionId}.jsonl`), "utf8");
  assert.match(history, /"stopReason":"aborted"/);
  assert.match(history, /durable queued prompt/);
  const journal = (await readFile(join(directory, "commands.jsonl"), "utf8"))
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as { type: string; idempotencyKey: string });
  for (const accepted of journal.filter((entry) => entry.type === "accepted")) {
    assert.ok(
      journal.some(
        (entry) => entry.type !== "accepted" && entry.idempotencyKey === accepted.idempotencyKey,
      ),
    );
  }
  const restarted = new AxlDaemon({
    socketPath,
    dataDirectory: directory,
    runtime: () => ({ model: reply, tools: new ToolRegistry() }),
  });
  await restarted.start();
  t.after(() => restarted.stop());
  const resumed = await connectUnixClient(socketPath);
  t.after(() => resumed.close());
  await resumed.request("session.resume", { sessionId: session.sessionId });
  assert.match(
    await readFile(join(directory, "sessions", `${session.sessionId}.jsonl`), "utf8"),
    /"queue.paused"/,
  );
  assert.equal(
    (
      await resumed.request("session.send", {
        sessionId: session.sessionId,
        content: [{ type: "text", text: "after restart" }],
        delivery: "prompt",
      })
    ).stopReason,
    "stop",
  );
});

test("shutdown accounts for opening runtimes and refuses new admission while cleanup is pending", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "axl-host-open-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const socketPath = join(directory, "axl.sock");
  const opening = deferred();
  const finishOpen = deferred();
  const cleaning = deferred();
  const finishClean = deferred();
  let forced = false;
  const daemon = new AxlDaemon({
    socketPath,
    dataDirectory: directory,
    forceTerminate: () => {
      forced = true;
    },
    runtime: async () => {
      opening.resolve();
      await finishOpen.promise;
      return {
        model: reply,
        tools: new ToolRegistry(),
        extensionHost: {
          activate() {},
          async dispose() {
            cleaning.resolve();
            await finishClean.promise;
          },
        },
      };
    },
  });
  await daemon.start();
  t.after(async () => {
    finishOpen.resolve();
    finishClean.resolve();
    await daemon.stop();
  });
  const host = new DaemonHostClient(new UnixSocketTransportFactory(socketPath), 100);
  const client = await connectUnixClient(socketPath);
  t.after(() => client.close());
  const create = client.request("session.create", { cwd: directory });
  await opening.promise;
  const status = await host.status();
  assert.equal(status.busy, true);
  assert.equal(status.pendingRequests, 1);
  assert.equal(status.sessions.length, 0);
  await assert.rejects(host.force(status.instanceId), code("shutdown_required"));
  const shutdown = host.shutdown(status, { interrupt: true, confirmed: true });
  // Attach the rejection check before the bounded host request times out.
  const timeout = assert.rejects(shutdown, code("host_timeout"));
  await until(async () => (await host.status()).state === "stopping");
  await assert.rejects(
    client.request("session.create", { cwd: directory }),
    code("daemon_stopping"),
  );
  finishOpen.resolve();
  await create;
  await cleaning.promise;
  await timeout;
  assert.equal(forced, false);
  await host.force(status.instanceId);
  await until(async () => forced);
  finishClean.resolve();
  await daemon.stop();
});
