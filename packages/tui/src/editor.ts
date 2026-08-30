// SPDX-FileCopyrightText: 2026 Hari Srinivasan
// SPDX-License-Identifier: Apache-2.0

import { graphemeWidth, visibleWidth } from "./render.ts";

export type EditorKey =
  | { readonly kind: "char"; readonly char: string }
  | { readonly kind: "left" | "right" | "up" | "down" | "home" | "end" }
  | { readonly kind: "word-left" | "word-right" }
  | { readonly kind: "backspace" | "delete" }
  | { readonly kind: "enter" | "newline" | "follow-up" }
  | { readonly kind: "tab" | "shift-tab" | "escape" }
  | { readonly kind: "paste-start" | "paste-end" }
  | { readonly kind: "ctrl" | "alt"; readonly char: string }
  | { readonly kind: "unknown" };

function kittyKey(code: number, modifier = 1): EditorKey {
  const bits = modifier - 1;
  const shift = (bits & 1) !== 0;
  const alt = (bits & 2) !== 0;
  const ctrl = (bits & 4) !== 0;
  if (code === 13) {
    if (alt) return { kind: "follow-up" };
    if (shift || ctrl) return { kind: "newline" };
    return { kind: "enter" };
  }
  if (code === 9) return { kind: shift ? "shift-tab" : "tab" };
  if (code === 27) return { kind: "escape" };
  if (code === 127 || code === 8) return { kind: "backspace" };
  const char = String.fromCodePoint(code);
  if (ctrl) return { kind: "ctrl", char: char.toLowerCase() };
  if (alt) return { kind: "alt", char };
  return { kind: "char", char };
}

/** Decode one terminal key, including Kitty/xterm modified-key sequences. */
export function decodeOneKey(data: string, index: number): { key: EditorKey; next: number } {
  const char = data[index] as string;
  if (char === "\x1b") {
    const rest = data.slice(index);
    if (rest.startsWith("\x1b\r") || rest.startsWith("\x1b\n")) {
      return { key: { kind: "newline" }, next: index + 2 };
    }
    if (rest.startsWith("\x1b\x7f")) {
      return { key: { kind: "ctrl", char: "w" }, next: index + 2 };
    }
    if (rest.startsWith("\x1bb")) return { key: { kind: "word-left" }, next: index + 2 };
    if (rest.startsWith("\x1bf")) return { key: { kind: "word-right" }, next: index + 2 };
    if (rest.startsWith("\x1bd")) return { key: { kind: "alt", char: "d" }, next: index + 2 };
    // biome-ignore lint/suspicious/noControlCharactersInRegex: terminal protocol parsing requires ESC
    const kitty = /^\x1b\[(\d+)(?:;(\d+)(?::\d+)?)?u/.exec(rest);
    if (kitty) {
      const sequence = kitty[0];
      return {
        key: kittyKey(Number(kitty[1]), Number(kitty[2] ?? 1)),
        next: index + sequence.length,
      };
    }
    // biome-ignore lint/suspicious/noControlCharactersInRegex: terminal protocol parsing requires ESC
    const csi = /^\x1b\[([0-9;]*)([A-Za-z~])/.exec(rest);
    if (csi) {
      const [sequence, argument, final] = csi as unknown as [string, string, string];
      const next = index + sequence.length;
      if (final === "A") return { key: { kind: "up" }, next };
      if (final === "B") return { key: { kind: "down" }, next };
      if (final === "C") {
        return { key: { kind: argument.includes(";5") ? "word-right" : "right" }, next };
      }
      if (final === "D") {
        return { key: { kind: argument.includes(";5") ? "word-left" : "left" }, next };
      }
      if (final === "H" || (final === "~" && argument === "1")) {
        return { key: { kind: "home" }, next };
      }
      if (final === "F" || (final === "~" && argument === "4")) {
        return { key: { kind: "end" }, next };
      }
      if (final === "Z") return { key: { kind: "shift-tab" }, next };
      if (final === "~" && argument === "3") return { key: { kind: "delete" }, next };
      if (final === "~" && argument === "200") return { key: { kind: "paste-start" }, next };
      if (final === "~" && argument === "201") return { key: { kind: "paste-end" }, next };
      return { key: { kind: "unknown" }, next };
    }
    if (rest.length === 1) return { key: { kind: "escape" }, next: index + 1 };
    const code = rest.codePointAt(1);
    if (code !== undefined) {
      const value = String.fromCodePoint(code);
      return { key: { kind: "alt", char: value }, next: index + 1 + value.length };
    }
    return { key: { kind: "unknown" }, next: data.length };
  }
  if (char === "\r") return { key: { kind: "enter" }, next: index + 1 };
  if (char === "\n") return { key: { kind: "newline" }, next: index + 1 };
  if (char === "\x7f" || char === "\b") return { key: { kind: "backspace" }, next: index + 1 };
  if (char === "\t") return { key: { kind: "tab" }, next: index + 1 };
  if (char === "\x01") return { key: { kind: "home" }, next: index + 1 };
  if (char === "\x05") return { key: { kind: "end" }, next: index + 1 };
  if (char < " ") {
    return {
      key: { kind: "ctrl", char: String.fromCharCode(char.charCodeAt(0) + 96) },
      next: index + 1,
    };
  }
  const code = data.codePointAt(index) as number;
  const value = String.fromCodePoint(code);
  return { key: { kind: "char", char: value }, next: index + value.length };
}

export function decodeKeys(data: string): EditorKey[] {
  const keys: EditorKey[] = [];
  for (let index = 0; index < data.length; ) {
    const decoded = decodeOneKey(data, index);
    keys.push(decoded.key);
    index = decoded.next;
  }
  return keys;
}

const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
const wordCharacter = /[\p{L}\p{N}_]/u;

function boundaries(value: string): number[] {
  const result = [0];
  for (const part of segmenter.segment(value)) result.push(part.index + part.segment.length);
  return [...new Set(result)];
}

function previousBoundary(value: string, at: number): number {
  const points = boundaries(value);
  for (let index = points.length - 1; index >= 0; index -= 1) {
    const point = points[index] as number;
    if (point < at) return point;
  }
  return 0;
}

function nextBoundary(value: string, at: number): number {
  for (const point of boundaries(value)) if (point > at) return point;
  return value.length;
}

function graphemeBefore(value: string, at: number): string {
  const from = previousBoundary(value, at);
  return value.slice(from, at);
}

function graphemeAt(value: string, at: number): string {
  return value.slice(at, nextBoundary(value, at));
}

export interface EditorView {
  readonly lines: readonly string[];
  readonly cursorRow: number;
  readonly cursorColumn: number;
}

interface EditorState {
  readonly buffer: string;
  readonly cursor: number;
}

/** Multi-line, Unicode-safe editor with history, undo, kill-ring, and soft wrapping. */
export class LineEditor {
  private buffer = "";
  private cursor = 0;
  private readonly history: string[] = [];
  private historyIndex = -1;
  private pendingDraft = "";
  private pasting = false;
  private pasteSnapshot = false;
  private readonly undo: EditorState[] = [];
  private readonly killRing: string[] = [];
  private lastYank: { start: number; end: number; ringIndex: number } | undefined;

  get text(): string {
    return this.buffer;
  }

  get isPasting(): boolean {
    return this.pasting;
  }

  clear(): void {
    if (!this.buffer) return;
    this.snapshot();
    this.buffer = "";
    this.cursor = 0;
    this.historyIndex = -1;
  }

  private snapshot(): void {
    const previous = this.undo.at(-1);
    if (!previous || previous.buffer !== this.buffer || previous.cursor !== this.cursor) {
      this.undo.push({ buffer: this.buffer, cursor: this.cursor });
      if (this.undo.length > 100) this.undo.shift();
    }
    this.lastYank = undefined;
  }

  private insert(text: string, record = true): void {
    if (record) this.snapshot();
    this.buffer = this.buffer.slice(0, this.cursor) + text + this.buffer.slice(this.cursor);
    this.cursor += text.length;
  }

  private position(): { row: number; lineStart: number; lineEnd: number; cellColumn: number } {
    const before = this.buffer.slice(0, this.cursor);
    const row = (before.match(/\n/g) ?? []).length;
    const lineStart = before.lastIndexOf("\n") + 1;
    const nextBreak = this.buffer.indexOf("\n", this.cursor);
    const lineEnd = nextBreak === -1 ? this.buffer.length : nextBreak;
    return {
      row,
      lineStart,
      lineEnd,
      cellColumn: visibleWidth(this.buffer.slice(lineStart, this.cursor)),
    };
  }

  private offsetAtCell(line: string, target: number): number {
    let cells = 0;
    for (const part of segmenter.segment(line)) {
      const width = graphemeWidth(part.segment);
      if (cells + width > target) return part.index;
      cells += width;
    }
    return line.length;
  }

  private moveVertical(delta: -1 | 1): boolean {
    const lines = this.buffer.split("\n");
    const { row, cellColumn } = this.position();
    const target = row + delta;
    if (target < 0 || target >= lines.length) return false;
    let absolute = 0;
    for (let index = 0; index < target; index += 1) absolute += (lines[index] as string).length + 1;
    this.cursor = absolute + this.offsetAtCell(lines[target] as string, cellColumn);
    return true;
  }

  private wordLeft(): number {
    let at = this.cursor;
    while (at > 0 && !wordCharacter.test(graphemeBefore(this.buffer, at)))
      at = previousBoundary(this.buffer, at);
    while (at > 0 && wordCharacter.test(graphemeBefore(this.buffer, at)))
      at = previousBoundary(this.buffer, at);
    return at;
  }

  private wordRight(): number {
    let at = this.cursor;
    while (at < this.buffer.length && !wordCharacter.test(graphemeAt(this.buffer, at)))
      at = nextBoundary(this.buffer, at);
    while (at < this.buffer.length && wordCharacter.test(graphemeAt(this.buffer, at)))
      at = nextBoundary(this.buffer, at);
    return at;
  }

  private remove(from: number, to: number): void {
    if (from === to) return;
    this.snapshot();
    this.buffer = this.buffer.slice(0, from) + this.buffer.slice(to);
    this.cursor = from;
  }

  private kill(from: number, to: number): void {
    if (from === to) return;
    this.snapshot();
    const removed = this.buffer.slice(from, to);
    this.killRing.unshift(removed);
    if (this.killRing.length > 20) this.killRing.pop();
    this.buffer = this.buffer.slice(0, from) + this.buffer.slice(to);
    this.cursor = from;
  }

  private undoOnce(): void {
    const state = this.undo.pop();
    if (!state) return;
    this.buffer = state.buffer;
    this.cursor = state.cursor;
    this.lastYank = undefined;
  }

  private yank(): void {
    const value = this.killRing[0];
    if (!value) return;
    const start = this.cursor;
    this.insert(value);
    this.lastYank = { start, end: this.cursor, ringIndex: 0 };
  }

  private yankPop(): void {
    const yank = this.lastYank;
    if (!yank || this.killRing.length < 2) return;
    const ringIndex = (yank.ringIndex + 1) % this.killRing.length;
    const value = this.killRing[ringIndex] as string;
    this.buffer = this.buffer.slice(0, yank.start) + value + this.buffer.slice(yank.end);
    this.cursor = yank.start + value.length;
    this.lastYank = { start: yank.start, end: this.cursor, ringIndex };
  }

  apply(key: EditorKey): string | undefined {
    if (key.kind === "paste-start") {
      this.pasting = true;
      this.pasteSnapshot = false;
      return undefined;
    }
    if (key.kind === "paste-end") {
      this.pasting = false;
      this.pasteSnapshot = false;
      return undefined;
    }
    if (this.pasting) {
      if (!this.pasteSnapshot) {
        this.snapshot();
        this.pasteSnapshot = true;
      }
      if (key.kind === "char") this.insert(key.char, false);
      else if (key.kind === "enter" || key.kind === "newline") this.insert("\n", false);
      else if (key.kind === "tab") this.insert("  ", false);
      return undefined;
    }

    switch (key.kind) {
      case "char":
        this.insert(key.char);
        break;
      case "newline":
        this.insert("\n");
        break;
      case "backspace": {
        const from = previousBoundary(this.buffer, this.cursor);
        this.remove(from, this.cursor);
        break;
      }
      case "delete":
        this.remove(this.cursor, nextBoundary(this.buffer, this.cursor));
        break;
      case "left":
        this.cursor = previousBoundary(this.buffer, this.cursor);
        break;
      case "right":
        this.cursor = nextBoundary(this.buffer, this.cursor);
        break;
      case "word-left":
        this.cursor = this.wordLeft();
        break;
      case "word-right":
        this.cursor = this.wordRight();
        break;
      case "home":
        this.cursor = this.position().lineStart;
        break;
      case "end":
        this.cursor = this.position().lineEnd;
        break;
      case "ctrl":
        if (key.char === "w") this.kill(this.wordLeft(), this.cursor);
        else if (key.char === "u") this.kill(this.position().lineStart, this.cursor);
        else if (key.char === "k") this.kill(this.cursor, this.position().lineEnd);
        else if (key.char === "y") this.yank();
        else if (key.char === "-" || key.char === "_") this.undoOnce();
        break;
      case "alt":
        if (key.char === "d") this.kill(this.cursor, this.wordRight());
        else if (key.char === "y") this.yankPop();
        break;
      case "up":
        if (!this.moveVertical(-1)) this.previousHistory();
        break;
      case "down":
        if (!this.moveVertical(1)) this.nextHistory();
        break;
      case "enter": {
        const submitted = this.buffer;
        if (submitted.trim()) this.history.push(submitted);
        this.buffer = "";
        this.cursor = 0;
        this.historyIndex = -1;
        this.pendingDraft = "";
        this.undo.length = 0;
        this.lastYank = undefined;
        return submitted;
      }
    }
    return undefined;
  }

  private previousHistory(): void {
    if (this.history.length === 0) return;
    if (this.historyIndex === -1) {
      this.pendingDraft = this.buffer;
      this.historyIndex = this.history.length - 1;
    } else if (this.historyIndex > 0) {
      this.historyIndex -= 1;
    }
    this.buffer = this.history[this.historyIndex] as string;
    this.cursor = this.buffer.length;
  }

  private nextHistory(): void {
    if (this.historyIndex === -1) return;
    if (this.historyIndex < this.history.length - 1) {
      this.historyIndex += 1;
      this.buffer = this.history[this.historyIndex] as string;
    } else {
      this.historyIndex = -1;
      this.buffer = this.pendingDraft;
    }
    this.cursor = this.buffer.length;
  }

  setText(text: string): void {
    if (text !== this.buffer) this.snapshot();
    this.buffer = text;
    this.cursor = text.length;
    this.historyIndex = -1;
  }

  render(width: number): EditorView {
    const contentWidth = Math.max(1, width);
    const logical = this.buffer.split("\n");
    const position = this.position();
    const lines: string[] = [];
    let cursorRow = 0;
    let cursorColumn = 0;

    for (const [logicalRow, line] of logical.entries()) {
      let current = "";
      let cells = 0;
      const cursorOffset = logicalRow === position.row ? this.cursor - position.lineStart : -1;
      let foundCursor = false;
      for (const part of segmenter.segment(line)) {
        if (part.index === cursorOffset) {
          cursorRow = lines.length;
          cursorColumn = cells;
          foundCursor = true;
        }
        const cellWidth = graphemeWidth(part.segment);
        if (cells > 0 && cells + cellWidth > contentWidth) {
          lines.push(current);
          current = "";
          cells = 0;
          if (part.index === cursorOffset) {
            cursorRow = lines.length;
            cursorColumn = 0;
            foundCursor = true;
          }
        }
        current += part.segment;
        cells += cellWidth;
      }
      if (cursorOffset === line.length) {
        if (cells >= contentWidth && line.length > 0) {
          lines.push(current);
          current = "";
          cells = 0;
        }
        cursorRow = lines.length;
        cursorColumn = cells;
        foundCursor = true;
      }
      lines.push(current);
      if (logicalRow === position.row && !foundCursor) {
        cursorRow = lines.length - 1;
        cursorColumn = cells;
      }
    }
    return { lines: lines.length ? lines : [""], cursorRow, cursorColumn };
  }
}
