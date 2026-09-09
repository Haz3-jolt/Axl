// SPDX-FileCopyrightText: 2026 Hari Srinivasan
// SPDX-License-Identifier: Apache-2.0

import type { SessionSummary } from "@axl/sdk";

export function sessionTitle(session: SessionSummary): string {
  return session.lastUserMessage ?? session.firstUserMessage ?? "New session";
}

export function restoreDraft(sent: string, current: string): string {
  return current ? `${sent}\n${current}` : sent;
}

export function matchesSession(session: SessionSummary, query: string): boolean {
  const needle = query.trim().toLocaleLowerCase();
  return (
    needle === "" || `${sessionTitle(session)}\n${session.cwd}`.toLocaleLowerCase().includes(needle)
  );
}
