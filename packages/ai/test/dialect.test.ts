// SPDX-FileCopyrightText: 2026 Hari Srinivasan
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import test from "node:test";

import { EVENT_FORMAT_VERSION, parseEvent } from "@kepler/protocol";

import {
  dialectBoundaryPayload,
  FrozenToolRoster,
  GENERIC_TOOL_DIALECT,
  OPENAI_CHAT_TOOL_DIALECT,
  parseToolDialect,
  resolveToolDialect,
  type ToolDeclaration,
  ToolDialectError,
} from "../src/index.ts";

const canonicalTools: readonly ToolDeclaration[] = [
  { name: "shell", description: "Run a command", inputSchema: { type: "object" } },
  { name: "read", description: "Read a file", inputSchema: { type: "object" } },
  { name: "browser.screenshot", description: "Capture the page", inputSchema: { type: "object" } },
];

test("the generic dialect renders canonical tools unchanged", () => {
  const roster = new FrozenToolRoster(GENERIC_TOOL_DIALECT, canonicalTools);
  assert.equal(roster.dialectId, "generic");
  assert.deepEqual(
    roster.tools.map((tool) => tool.name),
    ["shell", "read", "browser.screenshot"],
  );
  assert.equal(roster.toCanonical("browser.screenshot"), "browser.screenshot");
});

test("the openai-chat dialect sanitizes names while preserving canonical identity", () => {
  const roster = new FrozenToolRoster(OPENAI_CHAT_TOOL_DIALECT, canonicalTools);
  const screenshot = roster.toProvider("browser.screenshot");
  assert.equal(screenshot.name, "browser_screenshot");
  assert.equal(screenshot.canonicalName, "browser.screenshot");
  assert.equal(roster.toCanonical("browser_screenshot"), "browser.screenshot");
  // The kernel-facing side never changes.
  assert.equal(roster.toProvider("shell").name, "shell");
});

test("per-tool overrides rename and reshape without touching identity", () => {
  const dialect = {
    ...OPENAI_CHAT_TOOL_DIALECT,
    tools: {
      shell: { name: "bash", inputSchema: { type: "object", required: ["command"] } },
    },
  };
  const roster = new FrozenToolRoster(dialect, canonicalTools);
  const shell = roster.toProvider("shell");
  assert.equal(shell.name, "bash");
  assert.deepEqual(shell.inputSchema, { type: "object", required: ["command"] });
  assert.equal(roster.toCanonical("bash"), "shell");
});

test("name collisions after rendering fail loudly", () => {
  const tools: readonly ToolDeclaration[] = [
    { name: "a.b", description: "first", inputSchema: {} },
    { name: "a_b", description: "second", inputSchema: {} },
  ];
  assert.throws(
    () => new FrozenToolRoster(OPENAI_CHAT_TOOL_DIALECT, tools),
    (error) => error instanceof ToolDialectError && /same provider name a_b/.test(error.message),
  );
});

test("duplicate canonical declarations and unknown lookups fail loudly", () => {
  assert.throws(
    () =>
      new FrozenToolRoster(GENERIC_TOOL_DIALECT, [
        { name: "shell", description: "one", inputSchema: {} },
        { name: "shell", description: "two", inputSchema: {} },
      ]),
    /declared twice/,
  );
  const roster = new FrozenToolRoster(GENERIC_TOOL_DIALECT, canonicalTools);
  assert.throws(() => roster.toCanonical("missing"), ToolDialectError);
  assert.throws(() => roster.toProvider("missing"), ToolDialectError);
});

test("the roster is frozen between boundaries and fingerprinted deterministically", () => {
  const roster = new FrozenToolRoster(OPENAI_CHAT_TOOL_DIALECT, canonicalTools);
  assert.equal(Object.isFrozen(roster), true);
  assert.equal(Object.isFrozen(roster.tools), true);
  assert.equal(Object.isFrozen(roster.tools[0]), true);

  const identical = new FrozenToolRoster(OPENAI_CHAT_TOOL_DIALECT, canonicalTools);
  assert.equal(identical.fingerprint, roster.fingerprint);

  const smaller = new FrozenToolRoster(OPENAI_CHAT_TOOL_DIALECT, canonicalTools.slice(0, 2));
  assert.notEqual(smaller.fingerprint, roster.fingerprint);
});

test("unknown model dialects fall back to generic with the fallback visible", () => {
  const known = { "openai-chat": OPENAI_CHAT_TOOL_DIALECT };
  assert.deepEqual(resolveToolDialect("openai-chat", known), {
    dialect: OPENAI_CHAT_TOOL_DIALECT,
    fellBack: false,
  });
  assert.deepEqual(resolveToolDialect("fake", known), {
    dialect: GENERIC_TOOL_DIALECT,
    fellBack: true,
  });
});

test("dialect boundaries produce valid config.dialect events", () => {
  const roster = new FrozenToolRoster(OPENAI_CHAT_TOOL_DIALECT, canonicalTools);
  const payload = dialectBoundaryPayload(roster, "model_switch");
  const parsed = parseEvent({
    version: EVENT_FORMAT_VERSION,
    id: "018f47a5-4f18-7cc2-8000-123456789abc",
    sessionId: "123e4567-e89b-42d3-a456-426614174000",
    parentId: null,
    timestamp: 1,
    type: "config.dialect",
    payload,
  });
  assert.equal(parsed.type, "config.dialect");
  assert.deepEqual(parsed.payload, {
    dialectId: "openai-chat",
    rosterFingerprint: roster.fingerprint,
    reason: "model_switch",
  });
});

test("parseToolDialect validates data files loudly", () => {
  const valid = {
    id: "openai-chat",
    nameRule: { allowed: "a-zA-Z0-9_-", maxLength: 64 },
    tools: { shell: { name: "bash" } },
  };
  assert.deepEqual(parseToolDialect(valid), valid);

  assert.throws(() => parseToolDialect(null), /must be an object/);
  assert.throws(() => parseToolDialect({ id: "" }), /non-empty id/);
  assert.throws(
    () => parseToolDialect({ id: "x", nameRule: { allowed: "", maxLength: 0 } }),
    /invalid nameRule/,
  );
  assert.throws(
    () => parseToolDialect({ id: "x", tools: { shell: { name: 5 } } }),
    /non-string name/,
  );
});
