// SPDX-FileCopyrightText: 2026 Hari Srinivasan
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { WIRE_PROTOCOL_VERSION } from "@axl/protocol";
import WebSocket from "ws";
import { startWebGateway, verifyWebAssets } from "../src/web-gateway.ts";

test("web assets fail closed when missing, altered, or incompatible", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "axl-web-assets-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const html = '<div id="root"></div>';
  await writeFile(join(directory, "index.html"), html);
  const metadata = {
    webAssetVersion: 1,
    packageVersion: "0.0.0",
    sourceRevision: "fixture",
    wireVersion: WIRE_PROTOCOL_VERSION,
    entrypoints: ["index.html"],
    sha256: { "index.html": createHash("sha256").update(html).digest("hex") },
  };
  await writeFile(join(directory, "asset-metadata.json"), JSON.stringify(metadata));
  assert.equal((await verifyWebAssets(directory, "0.0.0")).wireVersion, WIRE_PROTOCOL_VERSION);
  await assert.rejects(verifyWebAssets(directory, "0.0.1"), /missing or incompatible/);
  await writeFile(join(directory, "index.html"), "changed");
  await assert.rejects(verifyWebAssets(directory), /hash mismatch/);
  await writeFile(
    join(directory, "asset-metadata.json"),
    JSON.stringify({ ...metadata, wireVersion: 0 }),
  );
  await assert.rejects(verifyWebAssets(directory), /missing or incompatible/);
});

test("the gateway exchanges one launch token and authenticates one daemon bridge", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "axl-web-gateway-"));
  const socketPath = join(directory, "daemon.sock");
  context.after(() => rm(directory, { recursive: true, force: true }));

  const html = '<div id="root"></div>';
  await writeFile(join(directory, "index.html"), html);
  await writeFile(
    join(directory, "asset-metadata.json"),
    JSON.stringify({
      webAssetVersion: 1,
      packageVersion: "0.0.0-test",
      sourceRevision: "fixture",
      wireVersion: WIRE_PROTOCOL_VERSION,
      entrypoints: ["index.html"],
      sha256: { "index.html": createHash("sha256").update(html).digest("hex") },
    }),
  );

  const daemon = createServer((socket) => socket.on("data", (data) => socket.write(data)));
  await new Promise<void>((resolve, reject) => {
    daemon.once("error", reject);
    daemon.listen(socketPath, resolve);
  });
  context.after(() => new Promise<void>((resolve) => daemon.close(() => resolve())));

  const launchToken = Buffer.alloc(32, 1);
  const gateway = await startWebGateway({
    socketPath,
    assetDirectory: directory,
    cwd: "/workspace",
    packageVersion: "0.0.0-test",
    launchToken,
    pathToken: Buffer.alloc(16, 2),
  });
  context.after(() => gateway.close());
  const origin = new URL(gateway.origin).origin;
  const exchangeUrl = new URL("auth/exchange", gateway.origin);
  const exchange = await fetch(exchangeUrl, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ token: launchToken.toString("base64url") }),
  });
  assert.equal(exchange.status, 200);
  const sessionCookie = exchange.headers.get("set-cookie");
  assert.ok(sessionCookie?.includes("HttpOnly"));
  if (sessionCookie === null) throw new Error("Gateway did not issue a session cookie");
  const cookieHeader = sessionCookie.split(";", 1)[0] ?? "";

  const replay = await fetch(exchangeUrl, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ token: launchToken.toString("base64url") }),
  });
  assert.equal(replay.status, 401);

  const bootstrap = await fetch(new URL("bootstrap", gateway.origin), {
    method: "POST",
    headers: { origin, cookie: cookieHeader },
  });
  assert.equal(bootstrap.status, 200);
  assert.deepEqual(await bootstrap.json(), {
    cwd: "/workspace",
    webSocketPath: `${new URL(gateway.origin).pathname}ws`,
  });

  const socket = new WebSocket(new URL("ws", gateway.origin), {
    headers: { origin, cookie: cookieHeader },
  });
  await new Promise<void>((resolve, reject) => {
    socket.once("open", resolve);
    socket.once("error", reject);
  });
  socket.send("ping\n");
  assert.equal(
    await new Promise<string>((resolve) =>
      socket.once("message", (data) => resolve(data.toString())),
    ),
    "ping",
  );
  socket.close();
});
