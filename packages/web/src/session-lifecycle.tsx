// SPDX-FileCopyrightText: 2026 Hari Srinivasan
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useRef, useState } from "react";
import type { SessionSummary } from "@axl/sdk";

export function SessionLifecycle({
  session,
  busy,
  capabilities,
  onRename,
  onClone,
  onExport,
  onDispose,
  onDelete,
  onClose,
}: {
  readonly session: SessionSummary;
  readonly busy: boolean;
  readonly capabilities: ReadonlySet<string>;
  readonly onRename: (title: string) => void;
  readonly onClone: () => void;
  readonly onExport: () => void;
  readonly onDispose: () => void;
  readonly onDelete: () => void;
  readonly onClose: () => void;
}): React.JSX.Element {
  const panel = useRef<HTMLElement>(null);
  const [title, setTitle] = useState(session.title ?? session.firstUserMessage ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const operationActive = ["running", "waiting_interaction", "disposing"].includes(session.runtime.state);

  useEffect(() => {
    const prior = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    panel.current?.querySelector<HTMLElement>("input")?.focus();
    return () => prior?.focus();
  }, []);

  const trapFocus = (event: React.KeyboardEvent): void => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab" || panel.current === null) return;
    const controls = [...panel.current.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled)")];
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

  return <div className="control-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="session-lifecycle" ref={panel} role="dialog" aria-modal="true" aria-labelledby="session-lifecycle-title" onKeyDown={trapFocus}>
      <header><div><strong id="session-lifecycle-title">Session controls</strong><small>{session.sessionId}</small></div><button className="control-close" aria-label="Close" onClick={onClose}>×</button></header>
      <form onSubmit={(event) => { event.preventDefault(); onRename(title.trim()); }}>
        <label htmlFor="session-title">Name</label>
        <div><input id="session-title" value={title} maxLength={256} onChange={(event) => setTitle(event.target.value)} /><button disabled={busy || operationActive || !title.trim() || title.trim() === (session.title ?? session.firstUserMessage) || !capabilities.has("session.rename")}>Save</button></div>
      </form>
      <div className="lifecycle-actions">
        <button disabled={busy || operationActive || !capabilities.has("session.clone")} onClick={onClone}><span><strong>Clone session</strong><small>Create a complete independent copy.</small></span><b aria-hidden="true">›</b></button>
        <button disabled={busy || operationActive || !capabilities.has("session.export")} onClick={onExport}><span><strong>Export artifact</strong><small>Download durable history and attachments.</small></span><b aria-hidden="true">↓</b></button>
        <button disabled={busy || ["inactive", "disposing"].includes(session.runtime.state) || !capabilities.has("session.dispose")} onClick={onDispose}><span><strong>End runtime</strong><small>Stop execution while preserving durable history.</small></span><b aria-hidden="true">■</b></button>
        {!confirmDelete ? <button className="danger" disabled={busy || operationActive || !capabilities.has("session.delete")} onClick={() => setConfirmDelete(true)}><span><strong>Delete history</strong><small>Permanently remove this session from the daemon.</small></span><b aria-hidden="true">×</b></button> : <div className="delete-confirm" role="alert"><p><strong>Delete this session permanently?</strong><span>This removes its durable history and cannot be undone.</span></p><div><button disabled={busy} onClick={() => setConfirmDelete(false)}>Cancel</button><button className="danger" disabled={busy || operationActive} onClick={onDelete}>Delete permanently</button></div></div>}
      </div>
    </section>
  </div>;
}
