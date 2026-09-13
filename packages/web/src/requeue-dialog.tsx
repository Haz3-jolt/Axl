// SPDX-FileCopyrightText: 2026 Hari Srinivasan
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useRef, type JSX } from "react";
import type { EventId, ProjectedQueueItem } from "@axl/sdk";
import { queueItemLabel } from "./requeue.ts";

export function RequeueDialog({
  items,
  busyItemId,
  error,
  onRequeue,
  onClose,
}: {
  readonly items: readonly ProjectedQueueItem[];
  readonly busyItemId?: EventId | undefined;
  readonly error?: string | undefined;
  readonly onRequeue: (queueItemId: EventId) => void;
  readonly onClose: () => void;
}): JSX.Element {
  const dialog = useRef<HTMLElement>(null);

  useEffect(() => {
    const prior = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    dialog.current?.querySelector<HTMLButtonElement>("button")?.focus();
    return () => prior?.focus();
  }, []);

  const handleKeyDown = (event: React.KeyboardEvent): void => {
    if (event.key === "Escape" && busyItemId === undefined) {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab" || dialog.current === null) return;
    const controls = [
      ...dialog.current.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"),
    ];
    const first = controls[0];
    const last = controls.at(-1);
    if (first === undefined || last === undefined) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return <div className="control-scrim" onMouseDown={(event) => {
    if (event.target === event.currentTarget && busyItemId === undefined) onClose();
  }}>
    <section className="requeue-dialog" ref={dialog} role="dialog" aria-modal="true" aria-labelledby="requeue-title" onKeyDown={handleKeyDown}>
      <header><span><strong id="requeue-title">Resume paused prompts</strong><small>Select a prompt to place at the back of the queue.</small></span><button type="button" aria-label="Close" disabled={busyItemId !== undefined} onClick={onClose}>×</button></header>
      {error && <p className="requeue-error" role="alert">{error}</p>}
      {items.length === 0 ? <p className="requeue-empty">No paused prompts remain.</p> : <ul>{items.map((item) => <li key={item.queueItemId}><span><strong>{queueItemLabel(item)}</strong><small>Paused after daemon restart</small></span><button type="button" disabled={busyItemId !== undefined} onClick={() => onRequeue(item.queueItemId)}>{busyItemId === item.queueItemId ? "Requeueing…" : "Requeue"}</button></li>)}</ul>}
    </section>
  </div>;
}
