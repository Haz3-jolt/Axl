// SPDX-FileCopyrightText: 2026 Hari Srinivasan
// SPDX-License-Identifier: Apache-2.0

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import type { JsonObject } from "@axl/protocol";

import { assertReadAllowed, type WorkspacePolicy } from "../path-policy.ts";
import type { KernelTool, ToolExecutionResult } from "../tools.ts";
import {
  optionalPositiveInteger,
  rejectUnknownFields,
  requiredString,
  ToolInputError,
} from "./validate.ts";

export interface ReadToolOptions {
  readonly cwd: string;
  /** Filesystem policy; every path is canonicalized and checked before reading. */
  readonly policy?: WorkspacePolicy;
  /** Maximum lines shown per call; more is available through offset/limit. */
  readonly maxLines?: number;
  /** Maximum bytes shown per call. */
  readonly maxBytes?: number;
}

const DEFAULT_MAX_LINES = 2_000;
const DEFAULT_MAX_BYTES = 96_000;

/**
 * Canonical `read` tool. Truncation never loses data — the complete content
 * stays on disk in the file itself, and the result names the offset to
 * continue from.
 */
export function makeReadTool(options: ReadToolOptions): KernelTool {
  const maxLines = options.maxLines ?? DEFAULT_MAX_LINES;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  return {
    name: "read",
    description: "Read a text file, optionally from a 1-based line offset with a line limit.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path, absolute or workspace-relative" },
        offset: { type: "integer", description: "1-based first line to read" },
        limit: { type: "integer", description: "Maximum number of lines to read" },
      },
      required: ["path"],
      additionalProperties: false,
    },
    async execute(input: JsonObject): Promise<ToolExecutionResult> {
      rejectUnknownFields(input, "read", ["path", "offset", "limit"]);
      let path = resolve(options.cwd, requiredString(input, "read", "path"));
      if (options.policy !== undefined) path = await assertReadAllowed(options.policy, path);
      const offset = optionalPositiveInteger(input, "read", "offset") ?? 1;
      const limit = Math.min(optionalPositiveInteger(input, "read", "limit") ?? maxLines, maxLines);

      let raw: Buffer;
      try {
        raw = await readFile(path);
      } catch (error) {
        throw new ToolInputError(
          `read: cannot read ${path}: ${(error as NodeJS.ErrnoException).code ?? "unknown error"}`,
        );
      }
      if (raw.subarray(0, 8_192).includes(0)) {
        throw new ToolInputError(`read: ${path} is a binary file`);
      }

      const allLines = raw.toString("utf8").split("\n");
      // A trailing newline produces one phantom empty final element.
      if (allLines[allLines.length - 1] === "") allLines.pop();
      const slice = allLines.slice(offset - 1, offset - 1 + limit);

      let text = slice.join("\n");
      let shownLines = slice.length;
      if (Buffer.byteLength(text, "utf8") > maxBytes) {
        let bytes = 0;
        const kept: string[] = [];
        for (const line of slice) {
          const lineBytes = Buffer.byteLength(line, "utf8") + 1;
          if (bytes + lineBytes > maxBytes) break;
          kept.push(line);
          bytes += lineBytes;
        }
        text = kept.join("\n");
        shownLines = kept.length;
      }

      const lastShown = offset - 1 + shownLines;
      const notes: string[] = [];
      if (lastShown < allLines.length) {
        notes.push(
          `[showing lines ${offset}-${lastShown} of ${allLines.length}; continue with offset ${lastShown + 1}]`,
        );
      }
      return {
        content: [{ type: "text", text: [text, ...notes].filter(Boolean).join("\n") }],
        isError: false,
        details: { path, totalLines: allLines.length, shownFrom: offset, shownTo: lastShown },
      };
    },
  };
}
