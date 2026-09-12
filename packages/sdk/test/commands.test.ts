// SPDX-FileCopyrightText: 2026 Hari Srinivasan
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import test from "node:test";

import {
  CommandController,
  mergeCommandDirectory,
  parseSessionId,
  type AxlClient,
  type CommandListResult,
} from "../src/index.ts";

const sessionId = parseSessionId("00000000-0000-4000-8000-000000000001");
const catalog: CommandListResult = {
  generation: "builtin-1",
  commands: [
    {
      id: "core.reload",
      name: "reload",
      aliases: [],
      description: "Reload project instructions, prompt, and tools",
      context: "session",
      argument: { required: false },
      requiredCapabilities: ["session.reload"],
      availability: { state: "available" },
    },
    {
      id: "core.thinking",
      name: "thinking",
      aliases: ["effort"],
      description: "Select reasoning effort",
      context: "session",
      argument: { required: false, hint: "level" },
      requiredCapabilities: ["session.configure"],
      availability: { state: "available" },
    },
  ],
};

test("command controller loads, searches, and invokes typed operations", async () => {
  const requests: Array<{ readonly method: string; readonly params: unknown }> = [];
  const client = {
    request: async (method: string, params: unknown) => {
      requests.push({ method, params });
      if (method === "command.list") return catalog;
      return method === "session.reload" ? { boundaryEventIds: [] } : {};
    },
  } as unknown as AxlClient;
  const commands = new CommandController(client, [
    {
      id: "web.settings",
      name: "settings",
      description: "Open web settings",
      run: () => undefined,
    },
  ]);

  await commands.refresh(sessionId);
  assert.deepEqual(
    commands.search("relo").map((command) => command.name),
    ["reload"],
  );
  assert.equal((await commands.invoke("/thinking", sessionId)).state, "focus");
  assert.deepEqual(await commands.invoke("/reload", sessionId), {
    state: "completed",
    command: "reload",
  });
  assert.deepEqual(requests, [
    { method: "command.list", params: { sessionId } },
    { method: "session.reload", params: { sessionId } },
  ]);
});

test("command directory rejects aliases that shadow another command", () => {
  assert.throws(
    () =>
      mergeCommandDirectory(catalog, [
        {
          id: "web.reload",
          name: "settings",
          aliases: ["reload"],
          description: "Conflict",
          run: () => undefined,
        },
      ]),
    /Command name collision: \/reload/,
  );
});
