// SPDX-FileCopyrightText: 2026 Hari Srinivasan
// SPDX-License-Identifier: Apache-2.0

import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { WIRE_PROTOCOL_VERSION } from "@axl/sdk";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = resolve(root, "dist");
const files: string[] = [];
async function walk(directory: string): Promise<void> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) await walk(path);
    else if (entry.name !== "asset-metadata.json") files.push(relative(dist, path));
  }
}
await walk(dist);
files.sort();
const sha256: Record<string, string> = {};
for (const file of files)
  sha256[file] = createHash("sha256")
    .update(await readFile(resolve(dist, file)))
    .digest("hex");
await writeFile(
  resolve(dist, "asset-metadata.json"),
  `${JSON.stringify({ webAssetVersion: 1, packageVersion: "0.0.0", sourceRevision: process.env.AXL_SOURCE_REVISION ?? "development", wireVersion: WIRE_PROTOCOL_VERSION, entrypoints: ["index.html"], sha256 }, null, 2)}\n`,
);
