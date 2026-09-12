// SPDX-FileCopyrightText: 2026 Hari Srinivasan
// SPDX-License-Identifier: Apache-2.0

import type { EffectiveCommand } from "@axl/sdk";

export function filterCommands(
  commands: readonly EffectiveCommand[],
  query: string,
): readonly EffectiveCommand[] {
  const term = query.trim().replace(/^\//, "").toLowerCase();
  if (!term) return commands;
  return commands.filter(
    (command) =>
      command.name.includes(term) ||
      command.aliases.some((alias) => alias.includes(term)) ||
      command.description.toLowerCase().includes(term),
  );
}
