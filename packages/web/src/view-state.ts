// SPDX-FileCopyrightText: 2026 Hari Srinivasan
// SPDX-License-Identifier: Apache-2.0

import type {
  ConversationState,
  PromptDeliveryMode,
  SessionSummary,
  WorkspaceDiffResult,
} from "@axl/sdk";

export type SelectedPromptDelivery = "auto" | Exclude<PromptDeliveryMode, "prompt">;

export function resolvePromptDelivery(
  selected: SelectedPromptDelivery,
  active: boolean,
): PromptDeliveryMode {
  return selected === "auto" ? (active ? "steer" : "prompt") : selected;
}

function messageText(
  content: readonly { readonly type: string; readonly text?: string }[],
): string {
  return content
    .filter((item) => item.type === "text")
    .map((item) => item.text ?? "")
    .join("");
}

export function transcriptPromptBreakpoints(
  conversation: ConversationState,
): readonly { readonly id: string; readonly text: string }[] {
  const compacted = new Set(conversation.compactedEventIds);
  return conversation.records.flatMap((record) =>
    record.kind === "event" &&
    !compacted.has(record.event.id) &&
    record.event.type === "user.message"
      ? [
          {
            id: record.event.id,
            text: messageText(record.event.payload.content).trim() || "Attachment",
          },
        ]
      : [],
  );
}

export function transcriptMessageMatches(
  conversation: ConversationState,
  query: string,
): readonly string[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return [];
  const compacted = new Set(conversation.compactedEventIds);
  return conversation.records.flatMap((record) =>
    record.kind === "event" &&
    !compacted.has(record.event.id) &&
    (record.event.type === "user.message" || record.event.type === "assistant.message") &&
    messageText(record.event.payload.content).toLocaleLowerCase().includes(needle)
      ? [record.event.id]
      : [],
  );
}

export function sessionUsageStats(conversation: ConversationState): {
  readonly cacheHitPercent: number;
  readonly tokensPerSecond?: number;
  readonly unknownCostResponses: number;
} {
  const promptTokens =
    conversation.usage.inputTokens +
    conversation.usage.cacheReadTokens +
    conversation.usage.cacheWriteTokens;
  let requestStartedAt: number | undefined;
  let outputTokens = 0;
  let responseMs = 0;
  let unknownCostResponses = 0;
  for (const record of conversation.records) {
    if (record.kind !== "event") continue;
    if (record.event.type === "model.request_configured") requestStartedAt = record.event.timestamp;
    else if (
      record.event.type === "assistant.message" &&
      record.event.payload.usage !== undefined
    ) {
      if (record.event.payload.usage.costUsd === undefined) unknownCostResponses += 1;
      if (requestStartedAt !== undefined && record.event.payload.usage.outputTokens > 0) {
        outputTokens += record.event.payload.usage.outputTokens;
        responseMs += Math.max(1, record.event.timestamp - requestStartedAt);
      }
      requestStartedAt = undefined;
    }
  }
  return {
    cacheHitPercent:
      promptTokens === 0 ? 0 : (conversation.usage.cacheReadTokens / promptTokens) * 100,
    ...(responseMs === 0 ? {} : { tokensPerSecond: (outputTokens * 1000) / responseMs }),
    unknownCostResponses,
  };
}

export function workspaceTotals(diffs: readonly WorkspaceDiffResult[]): {
  readonly additions: number;
  readonly deletions: number;
} {
  let additions = 0;
  let deletions = 0;
  for (const diff of diffs) {
    for (const hunk of diff.hunks) {
      for (const line of hunk.lines) {
        if (line.kind === "addition") additions += 1;
        else if (line.kind === "deletion") deletions += 1;
      }
    }
  }
  return { additions, deletions };
}

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
