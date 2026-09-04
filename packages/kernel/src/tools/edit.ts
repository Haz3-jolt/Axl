// SPDX-FileCopyrightText: 2026 Hari Srinivasan
// SPDX-License-Identifier: Apache-2.0

import { randomUUID } from "node:crypto";
import { readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import type { JsonObject } from "@axl/protocol";

import type { WorkspacePolicy } from "../path-policy.ts";
import type { KernelTool, ToolExecutionResult } from "../tools.ts";
import { withFileMutationQueue } from "./file-mutation-queue.ts";
import {
  optionalBoolean,
  rejectUnknownFields,
  requiredString,
  ToolInputError,
} from "./validate.ts";

export interface EditToolOptions {
  readonly cwd: string;
  /** Filesystem policy; every path is canonicalized and write-checked before editing. */
  readonly policy?: WorkspacePolicy;
}

function countOccurrences(haystack: string, needle: string): number {
  let count = 0;
  for (
    let index = haystack.indexOf(needle);
    index !== -1;
    index = haystack.indexOf(needle, index + needle.length)
  ) {
    count += 1;
  }
  return count;
}

/**
 * Canonical `edit` tool: exact-text replacement in an existing file. The old
 * text must match exactly once unless `replaceAll`; ambiguity and misses fail
 * loudly before anything is written. Writes are atomic via temp-file rename.
 */
export function makeEditTool(options: EditToolOptions): KernelTool {
  return {
    name: "edit",
    description:
      "Replace exact text in an existing file. oldText must occur exactly once unless replaceAll is true.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path, absolute or workspace-relative" },
        oldText: { type: "string", description: "Exact text to replace" },
        newText: { type: "string", description: "Replacement text" },
        replaceAll: { type: "boolean", description: "Replace every occurrence" },
      },
      required: ["path", "oldText", "newText"],
      additionalProperties: false,
    },
    async execute(input: JsonObject, signal: AbortSignal): Promise<ToolExecutionResult> {
      rejectUnknownFields(input, "edit", ["path", "oldText", "newText", "replaceAll"]);
      const requestedPath = requiredString(input, "edit", "path");
      const oldText = requiredString(input, "edit", "oldText");
      const newText = input.newText;
      if (typeof newText !== "string") {
        throw new ToolInputError("edit: newText must be a string");
      }
      if (oldText === newText) {
        throw new ToolInputError("edit: oldText and newText are identical");
      }
      const replaceAll = optionalBoolean(input, "edit", "replaceAll") ?? false;

      return withFileMutationQueue(
        options.cwd,
        requestedPath,
        options.policy,
        async (path): Promise<ToolExecutionResult> => {
          signal.throwIfAborted();
          let content: string;
          try {
            content = await readFile(path, { encoding: "utf8", signal });
          } catch (error) {
            if (signal.aborted) throw signal.reason;
            throw new ToolInputError(
              `edit: cannot read ${path}: ${(error as NodeJS.ErrnoException).code ?? "unknown error"}`,
            );
          }

          const occurrences = countOccurrences(content, oldText);
          if (occurrences === 0) {
            throw new ToolInputError(
              `edit: Target changed or no longer matches. Read the file again and retry. Path: ${path}`,
            );
          }
          if (occurrences > 1 && !replaceAll) {
            throw new ToolInputError(
              `edit: oldText occurs ${occurrences} times in ${path}; make it unique or set replaceAll`,
            );
          }

          const updated = replaceAll
            ? content.split(oldText).join(newText)
            : content.replace(oldText, newText);
          const temporary = `${path}.${randomUUID()}.axl-tmp`;
          try {
            const mode = (await stat(path)).mode & 0o777;
            signal.throwIfAborted();
            await writeFile(temporary, updated, { encoding: "utf8", mode, signal });
            signal.throwIfAborted();
            await rename(temporary, path);
          } finally {
            await rm(temporary, { force: true });
          }

          const replacements = replaceAll ? occurrences : 1;
          return {
            content: [
              {
                type: "text",
                text: `Replaced ${replacements} occurrence${replacements === 1 ? "" : "s"} in ${path}`,
              },
            ],
            isError: false,
            details: { path, replacements },
          };
        },
      );
    },
  };
}
