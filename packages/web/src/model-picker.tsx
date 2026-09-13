// SPDX-FileCopyrightText: 2026 Hari Srinivasan
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useRef, type JSX } from "react";
import type { ModelChoice, ThinkingLevel } from "@axl/sdk";

export function ModelPicker({
  choices,
  provider,
  model,
  thinking,
  disabled,
  error,
  openRequest,
  onModel,
  onThinking,
}: {
  readonly choices: readonly ModelChoice[];
  readonly provider: string | undefined;
  readonly model: string | undefined;
  readonly thinking: ThinkingLevel | undefined;
  readonly disabled: boolean;
  readonly error?: string;
  readonly openRequest?: number;
  readonly onModel: (choice: ModelChoice) => void;
  readonly onThinking: (level: ThinkingLevel) => void;
}): JSX.Element {
  const details = useRef<HTMLDetailsElement>(null);
  const selected = choices.find((choice) => choice.providerId === provider && choice.modelId === model);
  const levels = selected?.thinkingLevels ?? [];
  const close = (): void => details.current?.removeAttribute("open");
  useEffect(() => {
    if (openRequest === undefined || openRequest === 0) return;
    details.current?.setAttribute("open", "");
    queueMicrotask(() => details.current?.querySelector<HTMLButtonElement>("button")?.focus());
  }, [openRequest]);
  return <details className="model-picker" ref={details}>
    <summary aria-label="Choose model and effort">
      <span>{model ?? "Daemon default"}</span>
      {thinking && <><i>·</i><span>{thinking}</span></>}
      <svg viewBox="0 0 12 12" aria-hidden="true"><path d="m3 4.5 3 3 3-3" /></svg>
    </summary>
    <div className="model-menu">
      <p className="model-menu-label">Model</p>
      <div className="model-options">
        {choices.length === 0 && <p className="model-empty">No models available</p>}
        {choices.map((choice) => {
          const active = choice.providerId === provider && choice.modelId === model;
          const unavailable = choice.availability.status === "unavailable";
          return <button key={`${choice.providerId}:${choice.modelId}`} type="button" className={active ? "selected" : ""} disabled={disabled || unavailable} title={choice.availability.reason} onClick={() => { onModel(choice); close(); }}><i aria-hidden="true">{active ? "✓" : ""}</i><span><strong>{choice.displayName}</strong><small>{unavailable ? choice.availability.reason ?? "Unavailable" : choice.providerId}</small></span></button>;
        })}
      </div>
      {error && <p className="model-error" role="alert">{error}</p>}
      {levels.length > 0 && <><div className="model-menu-rule" /><p className="model-menu-label">Reasoning effort</p><div className="effort-options">{levels.map((level) => <button key={level} type="button" className={level === thinking ? "selected" : ""} disabled={disabled} onClick={() => { onThinking(level); close(); }}><i aria-hidden="true">{level === thinking ? "✓" : ""}</i><span>{level}</span></button>)}</div></>}
    </div>
  </details>;
}
