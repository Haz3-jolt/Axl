// SPDX-FileCopyrightText: 2026 Hari Srinivasan
// SPDX-License-Identifier: Apache-2.0

/** Begin/end synchronized output. Supporting terminals apply the frame atomically. */
export const SYNC_BEGIN = "\x1b[?2026h";
export const SYNC_END = "\x1b[?2026l";
export const RESET_LINE = "\x1b[0m\x1b]8;;\x07";
export const CURSOR_MARKER = "\x1b_kepler_cursor\x1b\\";

export interface Component {
  render(width: number): string[];
  handleInput?(data: string): void;
  invalidate?(): void;
}

export interface CursorPlacement {
  readonly row: number;
  readonly column: number;
}

const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });
const emojiPattern = /\p{Extended_Pictographic}|\p{Regional_Indicator}/u;
const markPattern = /^\p{Mark}+$/u;

function escapeLength(value: string, offset: number): number {
  if (value.charCodeAt(offset) !== 0x1b) return 0;
  const next = value[offset + 1];
  if (next === "[") {
    let index = offset + 2;
    while (index < value.length) {
      const code = value.charCodeAt(index);
      if (code >= 0x40 && code <= 0x7e) return index - offset + 1;
      index += 1;
    }
    return value.length - offset;
  }
  if (next === "]" || next === "_") {
    let index = offset + 2;
    while (index < value.length) {
      if (value.charCodeAt(index) === 0x07) return index - offset + 1;
      if (value.charCodeAt(index) === 0x1b && value[index + 1] === "\\") {
        return index - offset + 2;
      }
      index += 1;
    }
    return value.length - offset;
  }
  return Math.min(2, value.length - offset);
}

function isWideCodePoint(code: number): boolean {
  return (
    code >= 0x1100 &&
    (code <= 0x115f ||
      code === 0x2329 ||
      code === 0x232a ||
      (code >= 0x2e80 && code <= 0xa4cf && code !== 0x303f) ||
      (code >= 0xac00 && code <= 0xd7a3) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xfe10 && code <= 0xfe19) ||
      (code >= 0xfe30 && code <= 0xfe6f) ||
      (code >= 0xff00 && code <= 0xff60) ||
      (code >= 0xffe0 && code <= 0xffe6) ||
      (code >= 0x1f300 && code <= 0x1faff) ||
      (code >= 0x20000 && code <= 0x3fffd))
  );
}

export function graphemeWidth(value: string): number {
  if (value.length === 0 || markPattern.test(value)) return 0;
  const code = value.codePointAt(0) ?? 0;
  if (code === 0 || code < 0x20 || (code >= 0x7f && code < 0xa0)) return 0;
  if (emojiPattern.test(value) || value.includes("\u200d")) return 2;
  return isWideCodePoint(code) ? 2 : 1;
}

function tokens(value: string): Array<{ value: string; width: number; escape: boolean }> {
  const result: Array<{ value: string; width: number; escape: boolean }> = [];
  let textStart = 0;
  const appendText = (text: string): void => {
    for (const part of graphemes.segment(text)) {
      result.push({ value: part.segment, width: graphemeWidth(part.segment), escape: false });
    }
  };
  for (let index = 0; index < value.length; ) {
    const length = escapeLength(value, index);
    if (length === 0) {
      const code = value.codePointAt(index);
      index += code !== undefined && code > 0xffff ? 2 : 1;
      continue;
    }
    appendText(value.slice(textStart, index));
    result.push({ value: value.slice(index, index + length), width: 0, escape: true });
    index += length;
    textStart = index;
  }
  appendText(value.slice(textStart));
  return result;
}

export function stripAnsi(value: string): string {
  return tokens(value)
    .filter((token) => !token.escape)
    .map((token) => token.value)
    .join("");
}

/** Removes terminal control sequences from model and tool supplied text. */
export function sanitizeTerminalText(value: string): string {
  return (
    stripAnsi(value)
      .replaceAll("\t", "    ")
      .replaceAll("\r", "")
      // biome-ignore lint/suspicious/noControlCharactersInRegex: terminal controls are the input being removed
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g, "")
  );
}

/** Printable terminal-cell width, ignoring ANSI, OSC, and APC sequences. */
export function visibleWidth(value: string): number {
  return tokens(value).reduce((total, token) => total + token.width, 0);
}

/** Backward-compatible name used by the existing components. */
export const visibleLength = visibleWidth;

export function truncateToWidth(value: string, width: number, ellipsis = "…"): string {
  if (width <= 0) return "";
  if (visibleWidth(value) <= width) return value;
  const suffixWidth = Math.min(width, visibleWidth(ellipsis));
  const limit = Math.max(0, width - suffixWidth);
  let output = "";
  let used = 0;
  for (const token of tokens(value)) {
    if (token.escape) {
      output += token.value;
      continue;
    }
    if (used + token.width > limit) break;
    output += token.value;
    used += token.width;
  }
  return `${output}${suffixWidth > 0 ? ellipsis : ""}${RESET_LINE}`;
}

/** Hard-wraps on terminal-cell width while preserving active SGR styling. */
export function wrapLine(value: string, width: number): string[] {
  if (width <= 0 || visibleWidth(value) <= width) return [value];
  const lines: string[] = [];
  let current = "";
  let currentWidth = 0;
  let activeSgr = "";

  for (const token of tokens(value)) {
    if (token.escape) {
      current += token.value;
      // biome-ignore lint/suspicious/noControlCharactersInRegex: SGR starts with ESC
      if (/^\x1b\[[0-9;]*m$/.test(token.value)) {
        if (token.value === "\x1b[0m") activeSgr = "";
        else activeSgr += token.value;
      }
      continue;
    }
    if (token.width > 0 && currentWidth + token.width > width) {
      lines.push(activeSgr ? `${current}${RESET_LINE}` : current);
      current = activeSgr;
      currentWidth = 0;
    }
    current += token.value;
    currentWidth += token.width;
  }
  lines.push(current);
  return lines;
}

/**
 * Main-screen renderer. Committed transcript remains terminal scrollback while
 * only the live editor/footer region is repainted.
 */
export class DifferentialScreen {
  private previous: string[] = [];
  private width: number;
  private forceFull = false;
  private placedRow: number | null = null;
  private placedColumn = 0;

  constructor(width: number) {
    this.width = Math.max(1, width);
  }

  setWidth(width: number): void {
    const next = Math.max(1, width);
    if (next !== this.width) {
      this.width = next;
      this.forceFull = true;
    }
  }

  /** Forget cursor and line state after the terminal has been cleared externally. */
  reset(width = this.width): void {
    this.width = Math.max(1, width);
    this.previous = [];
    this.forceFull = false;
    this.placedRow = null;
    this.placedColumn = 0;
  }

  invalidate(): void {
    this.forceFull = true;
  }

  get liveHeight(): number {
    return this.previous.length;
  }

  frame(components: readonly Component[], cursor?: CursorPlacement): string {
    const lines = components.flatMap((component) => component.render(this.width));
    return this.frameLines(lines, cursor);
  }

  clear(): string {
    return this.frameLines([]);
  }

  private frameLines(rawLines: readonly string[], cursor?: CursorPlacement): string {
    const lines = rawLines.map((line) => {
      const clipped = truncateToWidth(line, this.width, "");
      return clipped.includes("\x1b") ? `${clipped}${RESET_LINE}` : clipped;
    });
    const previous = this.previous;
    let firstChanged = 0;
    if (!this.forceFull) {
      const shared = Math.min(previous.length, lines.length);
      while (firstChanged < shared && previous[firstChanged] === lines[firstChanged]) {
        firstChanged += 1;
      }
    }
    const unchanged =
      !this.forceFull && firstChanged === previous.length && firstChanged === lines.length;
    const targetRow =
      cursor === undefined ? null : Math.min(cursor.row, Math.max(0, lines.length - 1));
    const targetColumn = cursor === undefined ? 0 : Math.min(cursor.column, this.width - 1);
    if (
      unchanged &&
      this.placedRow === targetRow &&
      (targetRow === null || this.placedColumn === targetColumn)
    ) {
      return "";
    }

    let park = "";
    if (this.placedRow !== null) {
      park = `\x1b[${previous.length - this.placedRow}E`;
      this.placedRow = null;
      this.placedColumn = 0;
    }

    let paint = "";
    if (!unchanged) {
      const start = Math.min(this.forceFull ? 0 : firstChanged, lines.length);
      const moveUp = previous.length - start;
      if (moveUp > 0) paint += `\x1b[${moveUp}F`;
      for (let index = start; index < lines.length; index += 1) {
        paint += `\x1b[2K${lines[index]}\n`;
      }
      if (lines.length < previous.length) paint += "\x1b[0J";
      this.previous = [...lines];
      this.forceFull = false;
    }

    let place = "";
    if (targetRow !== null && this.previous.length > 0) {
      place = `\x1b[${this.previous.length - targetRow}F\x1b[${targetColumn + 1}G`;
      this.placedRow = targetRow;
      this.placedColumn = targetColumn;
    }
    if (!park && !paint && !place) return "";
    return `${SYNC_BEGIN}${park}${paint}${place}${SYNC_END}`;
  }
}
