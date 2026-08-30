// SPDX-FileCopyrightText: 2026 Hari Srinivasan
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { loadMcpConfig, mcpSecretValues, McpConfigError } from "../src/index.ts";

test("loads stdio and HTTP servers with project overrides", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "kepler-mcp-config-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const global = join(root, "global");
  const project = join(root, "project");
  await mkdir(join(project, ".kepler"), { recursive: true });
  await mkdir(global);
  await writeFile(
    join(global, "mcp.json"),
    JSON.stringify({
      servers: {
        local: { transport: "stdio", command: "node", args: ["server.mjs"], roots: ["."] },
        disabled: { transport: "stdio", command: "false" },
      },
    }),
  );
  await writeFile(
    join(project, ".kepler", "mcp.json"),
    JSON.stringify({
      servers: {
        disabled: { transport: "stdio", command: "false", enabled: false },
        remote: {
          transport: "http",
          url: "https://example.com/mcp",
          headers: { Authorization: "EXAMPLE_TOKEN" },
          oauth: { clientId: "kepler", scope: "tools" },
        },
      },
    }),
  );

  const servers = await loadMcpConfig({ cwd: project, globalDirectory: global });
  assert.deepEqual(
    servers.map((server) => server.name),
    ["local", "remote"],
  );
  assert.equal(servers[0]?.config.roots[0], project);
  assert.deepEqual(mcpSecretValues(servers, { EXAMPLE_TOKEN: "top-secret" }), ["top-secret"]);
});

test("rejects unsafe HTTP URLs and unknown configuration", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "kepler-mcp-config-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, ".kepler"));
  await writeFile(
    join(root, ".kepler", "mcp.json"),
    JSON.stringify({ servers: { bad: { transport: "http", url: "http://example.com/mcp" } } }),
  );
  await assert.rejects(loadMcpConfig({ cwd: root }), McpConfigError);
  await writeFile(
    join(root, ".kepler", "mcp.json"),
    JSON.stringify({ servers: { bad: { transport: "http", url: ":not-a-url" } } }),
  );
  await assert.rejects(loadMcpConfig({ cwd: root }), McpConfigError);
});
