// SPDX-FileCopyrightText: 2026 Hari Srinivasan
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { WIRE_PROTOCOL_VERSION } from "@axl/protocol";
import WebSocket from "ws";
import {
  encodeWebSessionArtifact,
  startWebGateway,
  verifyWebAssets,
  writeWebSessionArtifact,
} from "../src/web-gateway.ts";

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

test("browser session artifacts round-trip only manifest-declared files", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "axl-web-artifact-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const source = join(directory, "source");
  const target = join(directory, "target");
  const digest = createHash("sha256").update("attachment").digest("hex");
  await mkdir(join(source, "blobs"), { recursive: true });
  await writeFile(
    join(source, "manifest.json"),
    JSON.stringify({
      format: "axl.session",
      version: 1,
      sourceSessionId: "123e4567-e89b-42d3-a456-426614174000",
      sourceSha256: "a".repeat(64),
      eventCount: 1,
      blobDigests: [digest],
    }),
  );
  await writeFile(join(source, "events.jsonl"), "event\n");
  await writeFile(join(source, "blobs", digest), "attachment");

  const artifact = await encodeWebSessionArtifact(source);
  await writeWebSessionArtifact(artifact, target);
  assert.equal(await readFile(join(target, "events.jsonl"), "utf8"), "event\n");
  assert.equal(await readFile(join(target, "blobs", digest), "utf8"), "attachment");

  const invalid = JSON.parse(artifact.toString("utf8")) as { files: Record<string, string> };
  invalid.files.unexpected = "";
  await assert.rejects(
    writeWebSessionArtifact(Buffer.from(JSON.stringify(invalid)), join(directory, "invalid")),
    /unexpected files/,
  );
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
    stateDirectory: directory,
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
    preferences: {
      sidebarWidth: 264,
      changesWidth: 680,
      sidebarCollapsed: false,
      changesView: "files",
    },
  });
  const preferences = await fetch(new URL("preferences", gateway.origin), {
    method: "POST",
    headers: { origin, cookie: cookieHeader, "content-type": "application/json" },
    body: JSON.stringify({
      sidebarWidth: 300,
      changesWidth: 720,
      sidebarCollapsed: true,
      changesView: "all",
    }),
  });
  assert.equal(preferences.status, 200);
  assert.deepEqual(JSON.parse(await readFile(join(directory, "web-preferences.json"), "utf8")), {
    sidebarWidth: 300,
    changesWidth: 720,
    sidebarCollapsed: true,
    changesView: "all",
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
