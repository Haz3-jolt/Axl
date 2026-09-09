// SPDX-FileCopyrightText: 2026 Hari Srinivasan
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { WIRE_PROTOCOL_VERSION } from "@axl/protocol";
import { verifyWebAssets } from "../src/web-gateway.ts";

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
  assert.equal((await verifyWebAssets(directory)).wireVersion, WIRE_PROTOCOL_VERSION);
  await writeFile(join(directory, "index.html"), "changed");
  await assert.rejects(verifyWebAssets(directory), /hash mismatch/);
  await writeFile(
    join(directory, "asset-metadata.json"),
    JSON.stringify({ ...metadata, wireVersion: 0 }),
  );
  await assert.rejects(verifyWebAssets(directory), /missing or incompatible/);
});
