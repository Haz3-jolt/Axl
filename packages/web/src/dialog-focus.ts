// SPDX-FileCopyrightText: 2026 Hari Srinivasan
// SPDX-License-Identifier: Apache-2.0

export interface DialogKeyEvent {
  readonly key: string;
  readonly shiftKey: boolean;
  preventDefault(): void;
}

interface Focusable {
  focus(): void;
}

interface DialogRoot {
  querySelectorAll<Control extends Focusable>(selector: string): ArrayLike<Control>;
}

const FOCUSABLE =
  "button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, a[href]";

export function trapDialogFocus(
  event: DialogKeyEvent,
  root: DialogRoot | null,
  active: unknown = document.activeElement,
): void {
  if (event.key !== "Tab" || root === null) return;
  const controls = Array.from(root.querySelectorAll<Focusable>(FOCUSABLE));
  const first = controls[0];
  const last = controls.at(-1);
  if (first === undefined || last === undefined) return;
  if (event.shiftKey && active === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
}
