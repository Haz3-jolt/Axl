// SPDX-FileCopyrightText: 2026 Hari Srinivasan
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { type ChildProcess, spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createConnection, createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import { AxlClientError, DaemonHostClient } from "@axl/sdk";
import { connectUnixClient, createUnixDaemonHost, UnixSocketTransportFactory } from "@axl/sdk/unix";

const entry = fileURLToPath(new URL("../dist/main.js", import.meta.url));
const fixture = fileURLToPath(new URL("./fixtures/lifecycle-daemon.mjs", import.meta.url));

async function setup(t: TestContext, mode = "idle") {
  const home = await mkdtemp(join(tmpdir(), "axl-process-host-"));
  const directory = join(home, ".axl", "unsafe");
  await mkdir(directory, { recursive: true });
  const child = spawn(process.execPath, [fixture, directory, mode], {
    stdio: ["ignore", "ignore", "pipe", "ipc"],
  });
  let diagnostics = "";
  child.stderr?.on("data", (chunk: Buffer) => {
    diagnostics += chunk.toString();
  });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGKILL"); // Only this test's owned child, including intentionally wedged cleanup.
      await once(child, "exit");
    }
    const host = createUnixDaemonHost(join(directory, "axl.sock"));
    try {
      const status = await host.status();
      await host.shutdown(status, { interrupt: true, confirmed: true });
    } catch (error) {
      if (!(error instanceof AxlClientError) || error.code !== "connection_error") throw error;
    }
    await rm(home, { recursive: true, force: true });
  });
  await Promise.race([
    once(child, "message"),
    once(child, "exit").then(() => {
      throw new Error(diagnostics);
    }),
  ]);
  const socket = join(directory, "axl.sock");
  const env = {
    ...process.env,
    HOME: home,
    AZURE_OPENAI_API_KEY: "obviously-fake-test-key",
    AZURE_OPENAI_BASE_URL: "https://example.invalid/",
  };
  const cli = async (args: string[]) => {
    const process_ = spawn(process.execPath, [entry, ...args], {
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    process_.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    process_.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    const [code] = await once(process_, "exit");
    return { code, stdout, stderr };
  };
  return { home, directory, socket, child, cli };
}

async function exited(child: ChildProcess) {
  if (child.exitCode === null && child.signalCode === null) await once(child, "exit");
}

test("built CLI reports status, preserves history on restart, and handles missing daemons without credentials", async (t) => {
  const { home, socket, directory, child, cli } = await setup(t);
  const client = await connectUnixClient(socket);
  t.after(() => client.close());
  const session = await client.request("session.create", { cwd: home });
  await client.request("session.send", {
    sessionId: session.sessionId,
    content: [{ type: "text", text: "persist me" }],
    delivery: "prompt",
  });
  const history = await readFile(join(directory, "sessions", `${session.sessionId}.jsonl`));
  const status = await cli(["daemon", "status", "--unsafe"]);
  assert.equal(status.code, 0, status.stderr);
  assert.match(status.stdout, /lifecycle-fixture/);
  const refused = await cli(["daemon", "stop", "--unsafe"]);
  assert.equal(refused.code, 2);
  assert.equal(child.exitCode, null);
  const restart = await cli(["daemon", "restart", "--unsafe", "--yes"]);
  assert.equal(restart.code, 0, restart.stderr);
  await exited(child);
  const host = createUnixDaemonHost(socket);
  assert.notEqual((await host.status()).buildVersion, "lifecycle-fixture");
  assert.deepEqual(
    await readFile(join(directory, "sessions", `${session.sessionId}.jsonl`)),
    history,
  );
  const stop = await cli(["daemon", "stop", "--unsafe", "--yes"]);
  assert.equal(stop.code, 0, stop.stderr);
  assert.equal((await cli(["daemon", "status", "--unsafe"])).code, 3);
});

test("built CLI does not replace an incompatible daemon and its host channel remains usable", async (t) => {
  const { home, socket, child, cli } = await setup(t);
  const proxyPath = join(home, "old.sock");
  const proxy = createServer((downstream) => {
    const upstream = createConnection(socket);
    downstream.pipe(upstream);
    let buffer = "";
    upstream.on("data", (chunk: Buffer) => {
      buffer += chunk.toString();
      while (buffer.includes("\n")) {
        const end = buffer.indexOf("\n");
        const frame = JSON.parse(buffer.slice(0, end));
        buffer = buffer.slice(end + 1);
        if (frame.kind === "hello") frame.wireVersion -= 1;
        if (frame.kind === "host.response" && frame.status) frame.status.wireVersion -= 1;
        downstream.write(`${JSON.stringify(frame)}\n`);
      }
    });
    upstream.on("end", () => downstream.end());
    upstream.on("error", () => downstream.destroy());
    downstream.on("close", () => upstream.destroy());
    downstream.on("error", () => upstream.destroy());
  });
  await new Promise<void>((resolve) => proxy.listen(proxyPath, resolve));
  t.after(() => proxy.close());
  const incompatible = await cli(["--unsafe", "--socket", proxyPath]);
  assert.equal(incompatible.code, 1);
  assert.match(incompatible.stderr, /wire version/);
  assert.match(incompatible.stderr, /axl daemon status/);
  assert.equal(child.exitCode, null);
  const status = await cli(["daemon", "status", "--socket", proxyPath]);
  assert.equal(status.code, 0, status.stderr);
  const stopped = await cli(["daemon", "stop", "--socket", proxyPath]);
  assert.equal(stopped.code, 0, stopped.stderr);
  await exited(child);
});

test("busy CLI stop requires explicit interruption and records the abort before exiting", async (t) => {
  const { home, directory, socket, child, cli } = await setup(t, "active");
  const client = await connectUnixClient(socket);
  t.after(() => client.close());
  const session = await client.request("session.create", { cwd: home });
  const send = client.request("session.send", {
    sessionId: session.sessionId,
    content: [{ type: "text", text: "wait for cancellation" }],
    delivery: "prompt",
  });
  const host = createUnixDaemonHost(socket);
  for (let i = 0; !(await host.status()).busy; i++) {
    assert.ok(i < 100);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  const refused = await cli(["daemon", "stop", "--unsafe", "--yes"]);
  assert.equal(refused.code, 2);
  const stopped = await cli(["daemon", "stop", "--unsafe", "--yes", "--interrupt"]);
  assert.equal(stopped.code, 0, stopped.stderr);
  assert.equal((await send).stopReason, "aborted");
  await exited(child);
  assert.match(
    await readFile(join(directory, "sessions", `${session.sessionId}.jsonl`), "utf8"),
    /"stopReason":"aborted"/,
  );
});

for (const mode of ["hang", "fail"])
  test(`explicit force terminates only the identified process after ${mode} cleanup`, async (t) => {
    const { home, socket, child, cli } = await setup(t, mode);
    const client = await connectUnixClient(socket);
    t.after(() => client.close());
    await client.request("session.create", { cwd: home });
    const host = new DaemonHostClient(new UnixSocketTransportFactory(socket), 100);
    const status = await host.status();
    await assert.rejects(
      host.shutdown(status, { interrupt: true, confirmed: true }),
      (error: unknown) =>
        error instanceof AxlClientError &&
        error.code === (mode === "hang" ? "host_timeout" : "shutdown_failed"),
    );
    assert.equal(child.exitCode, null);
    assert.equal((await host.status()).state, mode === "hang" ? "stopping" : "failed");
    const force = await cli(["daemon", "stop", "--unsafe", "--force", "--yes"]);
    assert.equal(force.code, 0, force.stderr);
    await exited(child);
    assert.equal(child.exitCode, 1);
    const restarted = await cli(["daemon", "restart", "--unsafe"]);
    assert.equal(restarted.code, 0, restarted.stderr);
    assert.notEqual((await createUnixDaemonHost(socket).status()).instanceId, status.instanceId);
  });

test("missing control does not signal an unrelated PID from a lock file", async (t) => {
  const { home, child, cli } = await setup(t);
  const fakeHome = join(home, ".axl");
  await writeFile(
    join(fakeHome, ".axl-data.lock"),
    JSON.stringify({
      version: 1,
      pid: child.pid,
      token: "unrelated",
      owner: "daemon",
      acquiredAt: 1,
    }),
  );
  const absent = await cli(["daemon", "stop"]);
  assert.equal(absent.code, 3);
  assert.equal(child.exitCode, null);
});

test("legacy daemons report manual recovery instead of pretending host control succeeded", async (t) => {
  const { home, child, cli } = await setup(t);
  const socket = join(home, "legacy.sock");
  const legacy = createServer((peer) => {
    peer.write(`${JSON.stringify({ kind: "hello", wireVersion: 9 })}\n`);
    peer.once("data", () =>
      peer.end(
        `${JSON.stringify({ kind: "error", id: -1, error: { code: "bad_request", message: "unknown request", retryable: false } })}\n`,
      ),
    );
    peer.on("error", () => peer.destroy());
  });
  await new Promise<void>((resolve) => legacy.listen(socket, resolve));
  t.after(() => legacy.close());
  const stop = await cli(["daemon", "stop", "--socket", socket]);
  assert.equal(stop.code, 1);
  assert.match(stop.stderr, /no host-control channel/);
  assert.match(stop.stderr, /manually verify/);
  assert.equal(child.exitCode, null);
});
