// SPDX-FileCopyrightText: 2026 Hari Srinivasan
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useRef, type JSX } from "react";
import type {
  ModelChoice,
  NewSessionDraft,
  NewSessionDraftUpdate,
  ThinkingLevel,
} from "@axl/sdk";
import { ModelPicker } from "./model-picker.tsx";

export function NewSessionDialog({
  draft,
  models,
  busy,
  error,
  onChange,
  onSubmit,
  onClose,
}: {
  readonly draft: NewSessionDraft;
  readonly models: readonly ModelChoice[];
  readonly busy: boolean;
  readonly error?: string;
  readonly onChange: (update: NewSessionDraftUpdate) => void;
  readonly onSubmit: () => void;
  readonly onClose: () => void;
}): JSX.Element {
  const dialog = useRef<HTMLElement>(null);
  useEffect(() => {
    const prior = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    dialog.current?.querySelector<HTMLButtonElement>("button")?.focus();
    return () => prior?.focus();
  }, []);

  const handleKeyDown = (event: React.KeyboardEvent): void => {
    if (event.key === "Escape" && !busy) {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab" || dialog.current === null) return;
    const controls = [
      ...dialog.current.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled)"),
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

  const selected = models.find(
    (model) => model.providerId === draft.providerId && model.modelId === draft.modelId,
  );
  const updateModel = (model: ModelChoice): void => {
    onChange({
      providerId: model.providerId,
      modelId: model.modelId,
      ...(draft.thinkingLevel !== undefined && !model.thinkingLevels.includes(draft.thinkingLevel)
        ? { thinkingLevel: undefined }
        : {}),
    });
  };
  const updateThinking = (thinkingLevel: ThinkingLevel): void => onChange({ thinkingLevel });

  return <div className="control-scrim">
    <section className="new-session-dialog" ref={dialog} role="dialog" aria-modal="true" aria-labelledby="new-session-title" onKeyDown={handleKeyDown}>
      <header><span><strong id="new-session-title">New session</strong><small>Choose how Axl should work.</small></span><button type="button" aria-label="Close" disabled={busy} onClick={onClose}>×</button></header>
      <div className="new-session-body">
        <div className="session-mode" role="group" aria-label="Session mode">
          <button type="button" disabled={busy} aria-pressed={draft.mode === "chat"} onClick={() => onChange({ mode: "chat" })}><strong>Chat</strong><small>Conversation without workspace tools</small></button>
          <button type="button" disabled={busy} aria-pressed={draft.mode === "code"} onClick={() => onChange({ mode: "code" })}><strong>Code</strong><small>Work in an explicit workspace</small></button>
        </div>
        {draft.mode === "code" && <label className="new-session-workspace"><span>Workspace</span><input value={draft.workspace ?? ""} disabled={busy} onChange={(event) => onChange({ workspace: event.target.value })} placeholder="/path/to/workspace" autoComplete="off" spellCheck={false} /></label>}
        <div className="new-session-model"><span>Model and effort</span><ModelPicker choices={models} provider={draft.providerId} model={draft.modelId} thinking={draft.thinkingLevel} disabled={busy} onModel={updateModel} onThinking={updateThinking} /></div>
        {selected === undefined && <small className="new-session-default">The daemon will choose its configured model and effort.</small>}
        {error && <p className="new-session-error" role="alert">{error}</p>}
      </div>
      <footer><button type="button" disabled={busy} onClick={onClose}>Cancel</button><button type="button" className="primary" disabled={busy || (draft.mode === "code" && !draft.workspace?.trim())} onClick={onSubmit}>{busy ? "Creating…" : `Create ${draft.mode === "chat" ? "Chat" : "Code"}`}</button></footer>
    </section>
  </div>;
}
