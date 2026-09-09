// SPDX-FileCopyrightText: 2026 Hari Srinivasan
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ConversationState } from "@axl/sdk";
import { Conversation } from "@axl/ui/react";

const conversation = {
  records: [
    {
      kind: "event",
      event: { id: "provider", type: "config.provider", payload: { providerId: "anthropic" } },
    },
    {
      kind: "event",
      event: { id: "model", type: "config.model", payload: { modelId: "claude-sonnet-4-6" } },
    },
    {
      kind: "event",
      event: { id: "thinking", type: "config.thinking", payload: { effective: "high" } },
    },
    {
      kind: "event",
      event: { id: "request", timestamp: 1000, type: "model.request_configured", payload: {} },
    },
    {
      kind: "event",
      event: {
        id: "user",
        timestamp: 1500,
        type: "user.message",
        payload: {
          content: [
            { type: "text", text: "Inspect this image" },
            {
              type: "blob",
              blob: {
                sha256: "a".repeat(64),
                mediaType: "image/png",
                sizeBytes: 2048,
                name: "reference.png",
              },
            },
            {
              type: "blob",
              blob: {
                sha256: "b".repeat(64),
                mediaType: "application/pdf",
                sizeBytes: 4096,
                name: "notes.pdf",
              },
            },
          ],
        },
      },
    },
    {
      kind: "event",
      event: {
        id: "tool",
        type: "tool.call",
        payload: { callId: "bash", name: "bash", input: { command: "test" } },
      },
    },
    {
      kind: "event",
      event: {
        id: "queue",
        type: "queue.enqueued",
        payload: { content: [{ type: "text", text: "Queued prompt" }] },
      },
    },
    {
      kind: "event",
      event: {
        id: "interrupt",
        type: "interrupt.requested",
        payload: { content: [{ type: "text", text: "Replacement prompt" }] },
      },
    },
    {
      kind: "event",
      event: {
        id: "assistant",
        timestamp: 3000,
        type: "assistant.message",
        payload: {
          content: [{ type: "text", text: "Partial answer" }],
          stopReason: "length",
          usage: {
            inputTokens: 100,
            outputTokens: 20,
            cacheReadTokens: 50,
            cacheWriteTokens: 0,
            reasoningTokens: 5,
            costUsd: 0.0124,
          },
        },
      },
    },
    {
      kind: "event",
      event: { id: "request-2", timestamp: 4000, type: "model.request_configured", payload: {} },
    },
    {
      kind: "event",
      event: {
        id: "assistant-2",
        timestamp: 5000,
        type: "assistant.message",
        payload: {
          content: [{ type: "text", text: "Unknown cost" }],
          stopReason: "stop",
          usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 },
        },
      },
    },
  ],
  tools: [
    {
      callEventId: "tool",
      name: "bash",
      input: { command: "test" },
      renderIntent: "shell",
      result: {
        content: [{ type: "text", text: "bounded output" }],
        isError: false,
        details: { outputBytes: 319488, overflowPath: "/tmp/output.log" },
      },
    },
  ],
  queue: [
    {
      queueItemId: "queue",
      content: [{ type: "text", text: "Queued prompt" }],
      priority: "back",
      status: "paused",
    },
  ],
  interruptDeliveries: [
    {
      requestEventId: "interrupt",
      content: [{ type: "text", text: "Replacement prompt" }],
      status: "delivered",
    },
  ],
} as unknown as ConversationState;

test("renders message actions, attachments, delivery, truncation, and usage states", () => {
  const html = renderToStaticMarkup(
    createElement(Conversation, {
      conversation,
      resolveBlobUrl: () => "data:image/png;base64,AA==",
      onCopyMessage: () => undefined,
      onForkMessage: () => undefined,
    }),
  );

  assert.match(html, /reference\.png/);
  assert.match(html, /<img /);
  assert.match(html, /notes\.pdf/);
  assert.match(html, /Delivery paused/);
  assert.match(html, /Interrupted and delivered/);
  assert.match(html, /Output truncated/);
  assert.match(html, /312 KB total/);
  assert.match(html, /Response incomplete/);
  assert.match(html, /anthropic \/ claude-sonnet-4-6/);
  assert.match(html, /Cost unavailable/);
  assert.match(html, /\$0\.0124/);
  assert.match(html, /Cache hit/);
  assert.match(html, /tok\/s/);
  assert.match(html, /Copy message/);
  assert.match(html, /Fork from this message/);
});
