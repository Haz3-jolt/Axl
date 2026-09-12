// SPDX-FileCopyrightText: 2026 Hari Srinivasan
// SPDX-License-Identifier: Apache-2.0

import type { EffectiveCommand, PresentationCommand } from "@axl/sdk";

export function webPresentationCommands(
  canLogin: boolean,
  openProviders: () => void,
): readonly PresentationCommand[] {
  return canLogin
    ? [
        {
          id: "web.login",
          name: "login",
          description: "Authenticate a provider",
          run: openProviders,
        },
      ]
    : [];
}

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
