// SPDX-FileCopyrightText: 2026 Hari Srinivasan
// SPDX-License-Identifier: Apache-2.0

import { parseBlobReference, type BlobReference, type CanonicalEvent } from "@axl/protocol";

export function eventBlobReferences(event: CanonicalEvent): readonly BlobReference[] {
  const references: BlobReference[] = [];
  if (
    event.type === "user.message" ||
    event.type === "queue.enqueued" ||
    event.type === "interrupt.requested" ||
    event.type === "user.shell" ||
    event.type === "assistant.message" ||
    event.type === "tool.result"
  ) {
    for (const item of event.payload.content) {
      if (item.type === "blob") references.push(item.blob);
    }
  }
  if (
    event.type === "tool.result" &&
    typeof event.payload.details === "object" &&
    event.payload.details !== null &&
    !Array.isArray(event.payload.details)
  ) {
    const details = event.payload.details as { readonly [key: string]: unknown };
    if (details.overflowBlob !== undefined) {
      references.push(parseBlobReference(details.overflowBlob, "tool.result.details.overflowBlob"));
    }
  }
  return references;
}
