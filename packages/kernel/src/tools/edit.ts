// SPDX-FileCopyrightText: 2026 Hari Srinivasan
// SPDX-License-Identifier: Apache-2.0

import { randomUUID } from "node:crypto";
import { readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import type { JsonObject } from "@kepler/protocol";

import { assertWriteAllowed, type WorkspacePolicy } from "../path-policy.ts";
import type { KernelTool, ToolExecutionResult } from "../tools.ts";
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
    async execute(input: JsonObject): Promise<ToolExecutionResult> {
      rejectUnknownFields(input, "edit", ["path", "oldText", "newText", "replaceAll"]);
      let path = resolve(options.cwd, requiredString(input, "edit", "path"));
      if (options.policy !== undefined) path = await assertWriteAllowed(options.policy, path);
      const oldText = requiredString(input, "edit", "oldText");
      const newText = input.newText;
      if (typeof newText !== "string") {
        throw new ToolInputError("edit: newText must be a string");
      }
      if (oldText === newText) {
        throw new ToolInputError("edit: oldText and newText are identical");
      }
      const replaceAll = optionalBoolean(input, "edit", "replaceAll") ?? false;

      let content: string;
      try {
        content = await readFile(path, "utf8");
      } catch (error) {
        throw new ToolInputError(
          `edit: cannot read ${path}: ${(error as NodeJS.ErrnoException).code ?? "unknown error"}`,
        );
      }

      const occurrences = countOccurrences(content, oldText);
      if (occurrences === 0) {
        throw new ToolInputError(`edit: oldText not found in ${path}`);
      }
      if (occurrences > 1 && !replaceAll) {
        throw new ToolInputError(
          `edit: oldText occurs ${occurrences} times in ${path}; make it unique or set replaceAll`,
        );
      }

      const updated = replaceAll
        ? content.split(oldText).join(newText)
        : content.replace(oldText, newText);
      const temporary = `${path}.${randomUUID()}.kepler-tmp`;
      try {
        const mode = (await stat(path)).mode & 0o777;
        await writeFile(temporary, updated, { encoding: "utf8", mode });
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
  };
}
