// SPDX-FileCopyrightText: 2026 Hari Srinivasan
// SPDX-License-Identifier: Apache-2.0

import { sanitizeTerminalText, truncateToWidth, visibleWidth, wrapLine } from "./render.ts";
import type { Palette, ToolOutputDisplay } from "./transcript.ts";

const HIDDEN_RESULT_TOOLS = new Set(["read", "grep", "find", "ls", "edit", "write"]);
const COMPACT_PREVIEW_LINES = 8;
const BASH_PREVIEW_LINES = 10;
const DIFF_PREVIEW_LINES = 24;
const SPLIT_DIFF_MIN_WIDTH = 120;

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function field(input: Record<string, unknown>, name: string): string | undefined {
  return typeof input[name] === "string" ? sanitizeTerminalText(input[name]) : undefined;
}

function pathLabel(input: Record<string, unknown>): string {
  return field(input, "path") ?? field(input, "cwd") ?? ".";
}

function clipRows<T>(lines: readonly T[], limit: number): Array<T | string> {
  if (lines.length <= limit) return [...lines];
  const head = Math.ceil((limit - 1) / 2);
  const tail = Math.floor((limit - 1) / 2);
  return [
    ...lines.slice(0, head),
    `… ${lines.length - head - tail} lines hidden`,
    ...lines.slice(-tail),
  ];
}

function paint(palette: Palette, kind: "add" | "remove" | "context", value: string): string {
  if (kind === "add") return (palette.diffAdded ?? palette.success ?? palette.accent)(value);
  if (kind === "remove") return (palette.diffRemoved ?? palette.error)(value);
  return (palette.diffContext ?? palette.dim)(value);
}

interface ChangedLines {
  readonly before: readonly string[];
  readonly removed: readonly string[];
  readonly added: readonly string[];
  readonly after: readonly string[];
}

/** A bounded line comparison suitable for exact-replacement and write previews. */
function changedLines(oldText: string, newText: string): ChangedLines {
  const sanitizedOld = sanitizeTerminalText(oldText);
  const sanitizedNew = sanitizeTerminalText(newText);
  const oldLines = sanitizedOld ? sanitizedOld.split("\n") : [];
  const newLines = sanitizedNew ? sanitizedNew.split("\n") : [];
  let prefix = 0;
  while (
    prefix < oldLines.length &&
    prefix < newLines.length &&
    oldLines[prefix] === newLines[prefix]
  ) {
    prefix += 1;
  }
  let suffix = 0;
  while (
    suffix < oldLines.length - prefix &&
    suffix < newLines.length - prefix &&
    oldLines[oldLines.length - suffix - 1] === newLines[newLines.length - suffix - 1]
  ) {
    suffix += 1;
  }
  return {
    before: oldLines.slice(Math.max(0, prefix - 2), prefix),
    removed: oldLines.slice(prefix, oldLines.length - suffix),
    added: newLines.slice(prefix, newLines.length - suffix),
    after:
      suffix === 0 ? [] : oldLines.slice(oldLines.length - suffix, oldLines.length - suffix + 2),
  };
}

function unifiedDiff(change: ChangedLines, width: number, palette: Palette): string[] {
  const rows = [
    ...change.before.map((line) => ({ kind: "context" as const, prefix: "  ", line })),
    ...change.removed.map((line) => ({ kind: "remove" as const, prefix: "- ", line })),
    ...change.added.map((line) => ({ kind: "add" as const, prefix: "+ ", line })),
    ...change.after.map((line) => ({ kind: "context" as const, prefix: "  ", line })),
  ];
  const rendered = rows.flatMap((row) => {
    const available = Math.max(1, width - 4);
    return wrapLine(row.line || " ", available).map((line, index) =>
      paint(palette, row.kind, `  ${index === 0 ? row.prefix : "  "}${line}`),
    );
  });
  return clipRows(rendered, DIFF_PREVIEW_LINES) as string[];
}

function splitDiff(change: ChangedLines, width: number, palette: Palette): string[] {
  const before = change.before.map((line) => ({
    left: line,
    right: line,
    kind: "context" as const,
  }));
  const changed = Array.from(
    { length: Math.max(change.removed.length, change.added.length) },
    (_, index) => ({
      left: change.removed[index] ?? "",
      right: change.added[index] ?? "",
      kind: "change" as const,
    }),
  );
  const after = change.after.map((line) => ({ left: line, right: line, kind: "context" as const }));
  const column = Math.max(8, Math.floor((width - 9) / 2));
  const fit = (value: string): string =>
    value + " ".repeat(Math.max(0, column - visibleWidth(value)));
  const rendered = [...before, ...changed, ...after].flatMap((row) => {
    const leftRows = wrapLine(row.left || " ", column);
    const rightRows = wrapLine(row.right || " ", column);
    return Array.from({ length: Math.max(leftRows.length, rightRows.length) }, (_, index) => {
      const left = fit(truncateToWidth(leftRows[index] ?? "", column, "…"));
      const right = fit(truncateToWidth(rightRows[index] ?? "", column, "…"));
      if (row.kind === "context") return paint(palette, "context", `  ${left} │ ${right}`);
      return `  ${paint(palette, "remove", `- ${left}`)} │ ${paint(palette, "add", `+ ${right}`)}`;
    });
  });
  return clipRows(rendered, DIFF_PREVIEW_LINES) as string[];
}

function editPreview(input: Record<string, unknown>, width: number, palette: Palette): string[] {
  const oldText = field(input, "oldText") ?? "";
  const newText = field(input, "newText") ?? field(input, "content") ?? "";
  const change = changedLines(oldText, newText);
  if (width >= SPLIT_DIFF_MIN_WIDTH) return splitDiff(change, width, palette);
  return unifiedDiff(change, width, palette);
}

/** Compact call header plus an adaptive edit/write preview when content is available. */
export function renderToolCall(
  name: string,
  value: unknown,
  width: number,
  palette: Palette,
): string[] {
  const input = record(value);
  const title = palette.accent;
  const displayName = sanitizeTerminalText(name);
  switch (name) {
    case "shell":
    case "bash": {
      const command = field(input, "command") ?? "…";
      const cwd = field(input, "cwd");
      return wrapLine(`${title("$ ")}${command}${cwd ? palette.dim(`  in ${cwd}`) : ""}`, width);
    }
    case "read": {
      const offset = typeof input.offset === "number" ? input.offset : undefined;
      const limit = typeof input.limit === "number" ? input.limit : undefined;
      const range =
        offset === undefined
          ? ""
          : `:${offset}${limit === undefined ? "" : `-${offset + limit - 1}`}`;
      return wrapLine(`${title("read")} ${pathLabel(input)}${range}`, width);
    }
    case "grep":
      return wrapLine(
        `${title("grep")} /${field(input, "pattern") ?? ""}/ ${palette.dim(`in ${pathLabel(input)}`)}`,
        width,
      );
    case "find":
      return wrapLine(
        `${title("find")} ${field(input, "pattern") ?? ""} ${palette.dim(`in ${pathLabel(input)}`)}`,
        width,
      );
    case "ls":
      return wrapLine(`${title("ls")} ${pathLabel(input)}`, width);
    case "mcp": {
      const server = field(input, "server");
      const action = field(input, "action") ?? "request";
      const target = field(input, "name") ?? field(input, "uri");
      return wrapLine(
        `${title("mcp")} ${server ? `${server} · ` : ""}${action}${target ? ` · ${target}` : ""}`,
        width,
      );
    }
    case "edit":
    case "write":
      return [
        ...wrapLine(`${title(name)} ${pathLabel(input)}`, width),
        ...editPreview(input, width, palette),
      ];
    default:
      return wrapLine(
        `${title(displayName)} ${sanitizeTerminalText(JSON.stringify(input))}`,
        width,
      );
  }
}

function isMcpTool(name: string): boolean {
  return name === "mcp" || name.startsWith("mcp_") || name.includes("__mcp__");
}

/** Result rendering matching the native defaults: reads/searches hidden, shell previewed. */
export function renderToolResult(input: {
  readonly name: string;
  readonly text: string;
  readonly isError: boolean;
  readonly width: number;
  readonly mode: ToolOutputDisplay;
  readonly palette: Palette;
}): string[] {
  const { name, isError, width, mode, palette } = input;
  const text = sanitizeTerminalText(input.text);
  if (!isError && mode === "compact" && (HIDDEN_RESULT_TOOLS.has(name) || isMcpTool(name)))
    return [];

  const rawLines = text.split("\n");
  const limit =
    mode === "full"
      ? rawLines.length
      : name === "shell" || name === "bash"
        ? BASH_PREVIEW_LINES
        : COMPACT_PREVIEW_LINES;
  const lines = clipRows(rawLines, limit);
  const color = isError ? palette.error : (palette.text ?? palette.dim);
  return lines.flatMap((line) =>
    wrapLine(line || " ", Math.max(1, width - 2)).map((part) => color(`│ ${part}`)),
  );
}
