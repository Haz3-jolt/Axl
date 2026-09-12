// SPDX-FileCopyrightText: 2026 Hari Srinivasan
// SPDX-License-Identifier: Apache-2.0

import type { CapabilityId, CommandDescriptor, CommandListResult, SessionId } from "@axl/protocol";

const BUILT_INS: readonly Omit<CommandDescriptor, "availability">[] = [
  {
    id: "core.model",
    name: "model",
    aliases: [],
    description: "select a model grouped by provider",
    context: "session",
    argument: { required: false, hint: "provider/model" },
    requiredCapabilities: ["session.configure"],
  },
  {
    id: "core.thinking",
    name: "thinking",
    aliases: ["effort"],
    description: "select reasoning effort",
    context: "session",
    argument: { required: false, hint: "level" },
    requiredCapabilities: ["session.configure"],
  },
  {
    id: "core.providers",
    name: "providers",
    aliases: [],
    description: "show provider authentication and catalog status",
    context: "global",
    argument: { required: false, hint: "provider" },
    requiredCapabilities: ["provider.list"],
  },
  {
    id: "core.refresh",
    name: "refresh",
    aliases: [],
    description: "refresh configured provider catalogs",
    context: "global",
    argument: { required: false, hint: "provider" },
    requiredCapabilities: ["provider.catalog.refresh"],
  },
  {
    id: "core.logout",
    name: "logout",
    aliases: [],
    description: "remove stored provider authentication",
    context: "global",
    argument: { required: true, hint: "provider" },
    requiredCapabilities: ["provider.auth.logout"],
  },
  {
    id: "core.reload",
    name: "reload",
    aliases: [],
    description: "reload project instructions, prompt, and tools",
    context: "session",
    argument: { required: false },
    requiredCapabilities: ["session.reload"],
  },
  {
    id: "core.compact",
    name: "compact",
    aliases: [],
    description: "summarize older context",
    context: "session",
    argument: { required: false, hint: "instructions" },
    requiredCapabilities: ["session.compact"],
  },
  {
    id: "core.resume",
    name: "resume",
    aliases: [],
    description: "open another saved session",
    context: "global",
    argument: { required: false },
    requiredCapabilities: ["session.list", "session.resume"],
  },
  {
    id: "core.fork",
    name: "fork",
    aliases: [],
    description: "fork from an earlier user message",
    context: "session",
    argument: { required: false },
    requiredCapabilities: ["session.fork"],
  },
  {
    id: "core.clone",
    name: "clone",
    aliases: [],
    description: "clone the complete current session",
    context: "session",
    argument: { required: false },
    requiredCapabilities: ["session.clone"],
  },
  {
    id: "core.rename",
    name: "rename",
    aliases: [],
    description: "rename the current session",
    context: "session",
    argument: { required: true, hint: "title" },
    requiredCapabilities: ["session.rename"],
  },
  {
    id: "core.export",
    name: "export",
    aliases: [],
    description: "download a portable session artifact",
    context: "session",
    argument: { required: false },
    requiredCapabilities: ["session.export"],
  },
  {
    id: "core.import",
    name: "import",
    aliases: [],
    description: "import a portable session artifact",
    context: "global",
    argument: { required: false },
    requiredCapabilities: ["session.import"],
  },
  {
    id: "core.dispose",
    name: "dispose",
    aliases: ["end"],
    description: "stop the runtime and preserve durable history",
    context: "session",
    argument: { required: false },
    requiredCapabilities: ["session.dispose"],
  },
  {
    id: "core.delete",
    name: "delete",
    aliases: [],
    description: "permanently delete session history",
    context: "session",
    argument: { required: false },
    requiredCapabilities: ["session.delete"],
  },
  {
    id: "core.review",
    name: "review",
    aliases: [],
    description: "review working-tree or last-turn changes",
    context: "session",
    argument: { required: false, hint: "working | last-turn" },
    requiredCapabilities: ["session.workspace.status", "session.workspace.diff"],
  },
];

export function commandCatalog(
  capabilities: ReadonlySet<CapabilityId>,
  sessionId?: SessionId,
): CommandListResult {
  return {
    generation: "builtin-2",
    commands: BUILT_INS.filter((command) =>
      command.requiredCapabilities.every((capability) => capabilities.has(capability)),
    ).map((command) => ({
      ...command,
      availability:
        command.context === "session" && sessionId === undefined
          ? { state: "unavailable" as const, reason: "Open a session first" }
          : { state: "available" as const },
    })),
  };
}
