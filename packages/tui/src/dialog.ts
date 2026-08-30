// SPDX-FileCopyrightText: 2026 Hari Srinivasan
// SPDX-License-Identifier: Apache-2.0

// Bordered dialog rendering for modal overlays: title in the top border,
// content rows padded inside, footer hints above the bottom border.

import { visibleLength, wrapLine } from "./render.ts";
import type { Palette } from "./transcript.ts";

export interface DialogInput {
  readonly title: string;
  /** Pre-styled content rows; overlong rows are clipped to the dialog. */
  readonly rows: readonly string[];
  readonly footer?: string;
  /** Total terminal width available. */
  readonly width: number;
  readonly palette: Palette;
}

export const DIALOG_MAX_WIDTH = 76;

/** Inner content width for a dialog at the given terminal width. */
export function dialogInnerWidth(width: number): number {
  return Math.max(1, Math.min(DIALOG_MAX_WIDTH, width - 4) - 4);
}

/** Renders a dialog to lines. Content column starts at terminal column 2. */
export function renderDialog(input: DialogInput): string[] {
  const { title, rows, footer, width, palette } = input;
  const inner = dialogInnerWidth(width);
  const dim = palette.dim;

  const pad = (row: string): string => {
    const clipped = wrapLine(row, inner)[0] ?? "";
    return `${dim("│")} ${clipped}${" ".repeat(Math.max(0, inner - visibleLength(clipped)))} ${dim("│")}`;
  };

  const titleText = ` ${title} `;
  const topDashes = Math.max(0, inner - visibleLength(titleText));
  const top = dim(`╭─`) + palette.accent(titleText) + dim(`${"─".repeat(topDashes)}╮`);
  const bottom = dim(`╰${"─".repeat(inner + 2)}╯`);

  return [top, ...rows.map(pad), ...(footer === undefined ? [] : [pad(dim(footer))]), bottom];
}
