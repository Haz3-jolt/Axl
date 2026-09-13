// SPDX-FileCopyrightText: 2026 Hari Srinivasan
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useRef, type JSX } from "react";
import type {
  ModelChoice,
  NewSessionDraft,
  NewSessionDraftUpdate,
  ThinkingLevel,
} from "@axl/sdk";
import { trapDialogFocus } from "./dialog-focus.ts";
import { ModelPicker } from "./model-picker.tsx";
import { WebToolControls } from "./web-tool-controls.tsx";

export function NewSessionDialog({
  draft,
  models,
  modelPickerOpenRequest,
  busy,
  error,
  unavailableReason,
  onChange,
  onSubmit,
  onClose,
}: {
  readonly draft: NewSessionDraft;
  readonly models: readonly ModelChoice[];
  readonly modelPickerOpenRequest: number;
  readonly busy: boolean;
  readonly error?: string;
  readonly unavailableReason?: string;
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
    trapDialogFocus(event, dialog.current);
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
      <header>
        <span><strong id="new-session-title">New session</strong><small>Set the working context before Axl starts.</small></span>
        <button type="button" aria-label="Close" disabled={busy} onClick={onClose}><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 4 8 8m0-8-8 8" /></svg></button>
      </header>
      <div className="new-session-body">
        <section className="new-session-step" aria-labelledby="session-mode-label">
          <header><strong id="session-mode-label">Choose a session type</strong><small>Chat stays focused. Code adds a workspace and tools.</small></header>
          <div className="session-mode" role="group" aria-label="Session mode">
            <button type="button" disabled={busy} aria-pressed={draft.mode === "chat"} onClick={() => onChange({ mode: "chat" })}><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3.5 4.5h13v8h-7l-4 3v-3h-2z" /></svg><span><strong>Chat</strong><small>Talk without workspace access</small></span></button>
            <button type="button" disabled={busy} aria-pressed={draft.mode === "code"} onClick={() => onChange({ mode: "code" })}><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m7 5-5 5 5 5m6-10 5 5-5 5m-2-12L9 17" /></svg><span><strong>Code</strong><small>Work inside one workspace</small></span></button>
          </div>
        </section>
        {draft.mode === "code" && <section className="new-session-step"><label className="new-session-workspace"><span><strong>Workspace</strong><small>Required for Code sessions</small></span><input value={draft.workspace ?? ""} disabled={busy} onChange={(event) => onChange({ workspace: event.target.value })} placeholder="/path/to/workspace" autoComplete="off" spellCheck={false} /></label></section>}
        <section className="new-session-step">
          <div className="new-session-model"><span><strong>Model and effort</strong><small>{selected === undefined ? "Use the daemon defaults or choose now" : `${selected.providerDisplayName} · ${selected.displayName}`}</small></span><ModelPicker choices={models} provider={draft.providerId} model={draft.modelId} thinking={draft.thinkingLevel} openRequest={modelPickerOpenRequest} disabled={busy} onModel={updateModel} onThinking={updateThinking} /></div>
        </section>
        {draft.mode === "code" && <section className="new-session-step"><WebToolControls webSearch={draft.webSearch} webFetch={draft.webFetch} staged disabled={busy} onChange={(field, value) => onChange(field === "webSearch" ? { webSearch: value } : { webFetch: value })} /></section>}
        {error && <p className="new-session-error" role="alert">{error}</p>}
        {unavailableReason && <p className="new-session-error" role="status">{unavailableReason}</p>}
      </div>
      <footer><span>Your choices are applied together when the session starts.</span><div><button type="button" disabled={busy} onClick={onClose}>Cancel</button><button type="button" className="primary" title={unavailableReason} disabled={busy || unavailableReason !== undefined || (draft.mode === "code" && !draft.workspace?.trim())} onClick={onSubmit}>{busy ? "Creating…" : `Create ${draft.mode === "chat" ? "Chat" : "Code"}`}</button></div></footer>
    </section>
  </div>;
}
