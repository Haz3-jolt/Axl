// SPDX-FileCopyrightText: 2026 Hari Srinivasan
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { checkWorkspace } from "./check-boundaries.ts";

function writePackage(
  root: string,
  path: string,
  manifest: Record<string, unknown>,
  source = "export {};\n",
): void {
  const directory = join(root, "packages", path);
  mkdirSync(join(directory, "src"), { recursive: true });
  writeFileSync(join(directory, "package.json"), JSON.stringify(manifest));
  writeFileSync(join(directory, "src/index.ts"), source);
}

test("enforces protocol, kernel, and extension dependency boundaries", () => {
  const root = mkdtempSync(join(tmpdir(), "kepler-boundaries-"));
  writePackage(root, "protocol", { name: "@kepler/protocol", dependencies: { typebox: "1.0.0" } });
  writePackage(root, "kernel", {
    name: "@kepler/kernel",
    dependencies: { "@kepler/protocol": "workspace:*", yaml: "1.0.0" },
  });
  writePackage(
    root,
    "extensions/example",
    { name: "@kepler/example" },
    'import "@kepler/kernel/private";\n',
  );
  mkdirSync(join(root, "apps/example"), { recursive: true });
  writeFileSync(join(root, "apps/example/index.ts"), 'import "@kepler/kernel";\n');

  assert.deepEqual(checkWorkspace(root), [
    "packages/protocol must be dependency-free, found typebox",
    "packages/kernel may depend only on @kepler/protocol, found yaml",
    "packages/extensions/example/src/index.ts imports private kernel path @kepler/kernel/private",
    "apps/example/index.ts imports @kepler/kernel; apps may import only @kepler/sdk",
  ]);
});
