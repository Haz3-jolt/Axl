// SPDX-FileCopyrightText: 2026 Hari Srinivasan
// SPDX-License-Identifier: Apache-2.0

import type { CanonicalEvent } from "@axl/protocol";

import { type EventLogOptions, JsonlEventLog } from "./jsonl-event-log.ts";
import { SessionTree } from "./session-tree.ts";

export class ReplayError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReplayError";
  }
}

/**
 * Verifies tool call/result pairing along every branch: each `tool.result`
 * must answer exactly one earlier `tool.call` on its own lineage with the
 * same call ID and tool name. Unanswered calls at a branch tip are legal;
 * an interrupted session may end mid-tool.
 */
export function verifyToolCallIntegrity(tree: SessionTree): void {
  for (const leaf of tree.leaves()) {
    const calls = new Map<string, { name: string; answered: boolean }>();
    for (const event of tree.lineage(leaf)) {
      if (event.type === "tool.call") {
        if (calls.has(event.payload.callId)) {
          throw new ReplayError(
            `Event ${event.id} reuses tool call ID ${event.payload.callId} on one branch`,
          );
        }
        calls.set(event.payload.callId, { name: event.payload.name, answered: false });
      } else if (event.type === "tool.result") {
        const call = calls.get(event.payload.callId);
        if (call === undefined) {
          throw new ReplayError(
            `Event ${event.id} answers tool call ID ${event.payload.callId}, which has no call on its branch`,
          );
        }
        if (call.answered) {
          throw new ReplayError(
            `Event ${event.id} answers tool call ID ${event.payload.callId} a second time on one branch`,
          );
        }
        if (call.name !== event.payload.name) {
          throw new ReplayError(
            `Event ${event.id} answers tool call ID ${event.payload.callId} as ${event.payload.name}, not ${call.name}`,
          );
        }
        call.answered = true;
      }
    }
  }
}

export interface ReplaySessionResult {
  readonly events: readonly CanonicalEvent[];
  readonly tree: SessionTree;
}

/**
 * Deterministic regression replay. Model responses and tool results are
 * stubbed from the recorded source log; nothing runs live. The source is
 * integrity-checked, re-appended into an empty destination log through the
 * ordinary durable write path, read back, and required to reproduce the
 * source events exactly.
 */
export async function replaySessionLog(
  sourcePath: string,
  destinationPath: string,
  sessionId: unknown,
  options: EventLogOptions = {},
): Promise<ReplaySessionResult> {
  const source = await JsonlEventLog.open(sourcePath, sessionId, options);
  const sourceTree = SessionTree.fromEvents(source.log.sessionId, source.events);
  verifyToolCallIntegrity(sourceTree);

  const destination = await JsonlEventLog.open(destinationPath, source.log.sessionId, options);
  if (destination.events.length > 0) {
    throw new ReplayError(`Replay destination ${JSON.stringify(destinationPath)} is not empty`);
  }
  for (const event of source.events) await destination.log.append(event);

  const readBack = await destination.log.read();
  const tree = SessionTree.fromEvents(destination.log.sessionId, readBack.events);
  if (JSON.stringify(readBack.events) !== JSON.stringify(source.events)) {
    throw new ReplayError(
      `Replay into ${JSON.stringify(destinationPath)} diverged from the source log`,
    );
  }
  return { events: readBack.events, tree };
}
