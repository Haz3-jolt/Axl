// SPDX-FileCopyrightText: 2026 Hari Srinivasan
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";

import type { WorkspacePolicy } from "@kepler/kernel";

import {
  BUBBLEWRAP_CONTROLS,
  bubblewrapConfiguredPayload,
  buildBubblewrapArgv,
  buildBubblewrapProcess,
  detectBubblewrap,
  makeBubblewrapShellTool,
  SandboxUnavailableError,
} from "../src/index.ts";

const capabilities = await detectBubblewrap();
const integration = {
  skip: capabilities.available ? false : "bubblewrap unavailable on this host",
};
const noSignal = new AbortController().signal;

async function makeLayout(context: TestContext) {
  const root = await mkdtemp(join(tmpdir(), "kepler-bwrap-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const workspace = join(root, "workspace");
  const keplerHome = join(root, "kepler-home");
  await mkdir(workspace, { recursive: true });
  await mkdir(keplerHome, { recursive: true });
  await writeFile(join(keplerHome, "credentials.json"), '{"secret":"topsecret"}\n');
  await writeFile(join(root, "outside.txt"), "outside\n");
  const policy: WorkspacePolicy = { workspace, protectedPaths: [keplerHome] };
  const tool = makeBubblewrapShellTool({
    cwd: workspace,
    overflowDirectory: join(root, "overflow"),
    policy,
    capabilities,
  });
  return { root, workspace, keplerHome, policy, tool };
}

function text(result: { content: readonly { type: string; text?: string }[] }): string {
  return result.content[0]?.type === "text" ? (result.content[0].text ?? "") : "";
}

test("builds the confinement argv: namespaces, masks, cleared environment", () => {
  const policy: WorkspacePolicy = { workspace: "/repo", protectedPaths: ["/home/user/.kepler"] };
  const argv = buildBubblewrapArgv(policy, "echo hi", "/repo", {
    PATH: "/usr/bin",
    HOME: "/home/user",
  });
  assert.equal(argv[0], "bwrap");
  assert.equal(argv.includes("--unshare-all"), true);
  assert.equal(argv.includes("--die-with-parent"), true);
  assert.equal(argv.includes("--clearenv"), true);
  assert.deepEqual(argv.slice(argv.indexOf("--bind"), argv.indexOf("--bind") + 3), [
    "--bind",
    "/repo",
    "/repo",
  ]);
  const maskIndex = argv.indexOf("--tmpfs", argv.indexOf("--bind"));
  assert.deepEqual(argv.slice(maskIndex, maskIndex + 2), ["--tmpfs", "/home/user/.kepler"]);
  assert.deepEqual(argv.slice(-5), ["--chdir", "/repo", "bash", "-c", "echo hi"]);
  // No environment value leaks without an allowlist entry.
  assert.equal(argv.includes("AZURE_OPENAI_API_KEY"), false);
});

test("wraps long-lived extension processes without a shell", () => {
  const policy: WorkspacePolicy = { workspace: "/repo", protectedPaths: ["/home/user/.kepler"] };
  const process = buildBubblewrapProcess(policy, "node", ["server.mjs"], "/repo", {
    PATH: "/usr/bin",
    MCP_TOKEN: "secret",
  });
  assert.equal(process.command, "bwrap");
  assert.deepEqual(process.args.slice(-4), ["--chdir", "/repo", "node", "server.mjs"]);
  assert.deepEqual(process.env, { PATH: "/usr/bin", MCP_TOKEN: "secret" });
  assert.equal(process.args.includes("secret"), false);
});

test("failIfUnavailable: constructing the tool without bubblewrap throws", () => {
  assert.throws(
    () =>
      makeBubblewrapShellTool({
        cwd: "/repo",
        overflowDirectory: "/tmp/overflow",
        policy: { workspace: "/repo", protectedPaths: [] },
        capabilities: { available: false, reason: "bwrap binary not found" },
      }),
    (error) =>
      error instanceof SandboxUnavailableError &&
      /does not run tools unsandboxed/.test(error.message),
  );
});

test("the configured payload reports provider and controls honestly", () => {
  const enforced = bubblewrapConfiguredPayload({ available: true, version: "x" });
  assert.equal(enforced.provider, "bubblewrap");
  assert.equal(enforced.enforced, true);
  assert.deepEqual(enforced.controls, [...BUBBLEWRAP_CONTROLS]);
  const missing = bubblewrapConfiguredPayload({ available: false, reason: "nope" });
  assert.deepEqual(missing, { provider: "bubblewrap", enforced: false, controls: [] });
});

test("sandboxed commands run and workspace writes work", integration, async (context) => {
  const { workspace, tool } = await makeLayout(context);
  const result = await tool.execute({ command: "echo made > made.txt && cat made.txt" }, noSignal);
  assert.equal(result.isError, false);
  assert.match(text(result), /made/);
  assert.equal(await readFile(join(workspace, "made.txt"), "utf8"), "made\n");
});

test(
  "writes outside the workspace fail on a read-only filesystem",
  integration,
  async (context) => {
    const { tool } = await makeLayout(context);
    // The host filesystem outside the workspace is a read-only bind.
    const readOnly = await tool.execute({ command: "echo pwned > /usr/bwrap-probe" }, noSignal);
    assert.equal(readOnly.isError, true);
    assert.match(text(readOnly), /[Rr]ead-only file system/);
  },
);

test(
  "host /tmp is invisible: scratch writes never reach host files",
  integration,
  async (context) => {
    const { root, tool } = await makeLayout(context);
    // Inside the sandbox /tmp is a fresh private tmpfs, so this write succeeds —
    // into the sandbox, not the host.
    const result = await tool.execute(
      { command: `echo pwned > ${join(root, "outside.txt")}; cat ${join(root, "outside.txt")}` },
      noSignal,
    );
    assert.equal(result.isError, false);
    assert.match(text(result), /pwned/);
    assert.equal(await readFile(join(root, "outside.txt"), "utf8"), "outside\n");
  },
);

test("protected paths are invisible inside the sandbox", integration, async (context) => {
  const { keplerHome, tool } = await makeLayout(context);
  const result = await tool.execute(
    { command: `cat ${join(keplerHome, "credentials.json")}; ls -A ${keplerHome}` },
    noSignal,
  );
  assert.equal(text(result).includes("topsecret"), false);
  assert.match(text(result), /No such file|^\s*$/m);
});

test("the sandbox has no network", integration, async (context) => {
  const { tool } = await makeLayout(context);
  const result = await tool.execute(
    {
      command:
        "cat /proc/net/route | tail -n +2 | wc -l; (exec 3<>/dev/tcp/127.0.0.1/1 && echo CONNECTED) 2>&1 || true",
    },
    noSignal,
  );
  assert.equal(text(result).includes("CONNECTED"), false);
});

test("the environment is cleared to the allowlist", integration, async (context) => {
  const { tool } = await makeLayout(context);
  process.env.KEPLER_TEST_SECRET = "leaky-value";
  context.after(() => {
    delete process.env.KEPLER_TEST_SECRET;
  });
  const result = await tool.execute({ command: "env" }, noSignal);
  assert.equal(text(result).includes("leaky-value"), false);
  assert.match(text(result), /PATH=/);
});
