// SPDX-FileCopyrightText: 2026 Hari Srinivasan
// SPDX-License-Identifier: Apache-2.0

import { useRef, type JSX } from "react";
import type { ThinkingLevel } from "@axl/sdk";
import type { ModelChoice } from "./model-catalog.ts";

export function ModelPicker({
  choices,
  provider,
  model,
  thinking,
  disabled,
  onModel,
  onThinking,
}: {
  readonly choices: readonly ModelChoice[];
  readonly provider: string | undefined;
  readonly model: string | undefined;
  readonly thinking: ThinkingLevel | undefined;
  readonly disabled: boolean;
  readonly onModel: (choice: ModelChoice) => void;
  readonly onThinking: (level: ThinkingLevel) => void;
}): JSX.Element {
  const details = useRef<HTMLDetailsElement>(null);
  const selected = choices.find((choice) => choice.providerId === provider && choice.modelId === model);
  const levels = selected?.thinkingLevels ?? [];
  const close = (): void => details.current?.removeAttribute("open");
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
          return <button key={`${choice.providerId}:${choice.modelId}`} type="button" className={active ? "selected" : ""} disabled={disabled} onClick={() => { onModel(choice); close(); }}><i aria-hidden="true">{active ? "✓" : ""}</i><span><strong>{choice.displayName}</strong><small>{choice.providerId}</small></span></button>;
        })}
      </div>
      {levels.length > 0 && <><div className="model-menu-rule" /><p className="model-menu-label">Reasoning effort</p><div className="effort-options">{levels.map((level) => <button key={level} type="button" className={level === thinking ? "selected" : ""} disabled={disabled} onClick={() => { onThinking(level); close(); }}><i aria-hidden="true">{level === thinking ? "✓" : ""}</i><span>{level}</span></button>)}</div></>}
    </div>
  </details>;
}
