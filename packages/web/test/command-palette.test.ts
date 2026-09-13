// SPDX-FileCopyrightText: 2026 Hari Srinivasan
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import test from "node:test";
import type { EffectiveCommand } from "@axl/sdk";

import { filterCommands, webPresentationCommands } from "../src/commands.ts";

const commands: readonly EffectiveCommand[] = [
  {
    id: "core.reload",
    name: "reload",
    aliases: [],
    description: "Reload project instructions",
    context: "session",
    argument: { required: false },
    requiredCapabilities: ["session.reload"],
    availability: { state: "available" },
    source: "daemon",
  },
  {
    id: "core.model",
    name: "model",
    aliases: [],
    description: "Select a provider model",
    context: "session",
    argument: { required: false, hint: "provider/model" },
    requiredCapabilities: ["session.configure"],
    availability: { state: "unavailable", reason: "Open a session first" },
    source: "daemon",
  },
];

test("web presentation commands open login and configure appearance", async () => {
  let providersOpened = 0;
  let themeOpened = 0;
  let theme = "";
  const commands = webPresentationCommands({
    canLogin: true,
    openProviders: () => {
      providersOpened += 1;
    },
    openTheme: () => {
      themeOpened += 1;
    },
    setTheme: (value) => {
      theme = value;
    },
  });

  assert.deepEqual(
    commands.map((command) => command.name),
    ["login", "theme"],
  );
  await commands.find((command) => command.name === "login")?.run();
  await commands.find((command) => command.name === "theme")?.run();
  await commands.find((command) => command.name === "theme")?.run("light");
  assert.equal(providersOpened, 1);
  assert.equal(themeOpened, 1);
  assert.equal(theme, "light");
  await assert.rejects(
    async () => commands.find((command) => command.name === "theme")?.run("sepia"),
    /Theme must be system, light, or dark/,
  );
  assert.deepEqual(
    webPresentationCommands({
      canLogin: false,
      openProviders: () => undefined,
      openTheme: () => undefined,
      setTheme: () => undefined,
    }).map((command) => command.name),
    ["theme"],
  );
});

test("command palette search matches names and descriptions", () => {
  assert.deepEqual(
    filterCommands(commands, "/re").map((command) => command.name),
    ["reload"],
  );
  assert.deepEqual(
    filterCommands(commands, "provider").map((command) => command.name),
    ["model"],
  );
  assert.deepEqual(filterCommands(commands, "missing"), []);
});
