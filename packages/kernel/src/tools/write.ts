// SPDX-FileCopyrightText: 2026 Hari Srinivasan
// SPDX-FileCopyrightText: 2026 Lokesh
// SPDX-License-Identifier: Apache-2.0

import { randomUUID } from "node:crypto";
import { mkdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import type { JsonObject } from "@axl/protocol";

import type { WorkspacePolicy } from "../path-policy.ts";
import type { KernelTool, ToolExecutionResult } from "../tools.ts";
import { withFileMutationQueue } from "./file-mutation-queue.ts";
import { rejectUnknownFields, requiredString, ToolInputError } from "./validate.ts";

export interface WriteToolOptions {
  readonly cwd: string;
  readonly policy?: WorkspacePolicy;
  readonly maxBytes?: number;
}

const DEFAULT_MAX_BYTES = 1_000_000;

/** Canonical `write` tool. Creates or atomically replaces one UTF-8 text file. */
export function makeWriteTool(options: WriteToolOptions): KernelTool {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  return {
    name: "write",
    description: "Create or overwrite a UTF-8 text file. Parent directories are created as needed.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path, absolute or workspace-relative" },
        content: { type: "string", description: "Complete file content" },
      },
      required: ["path", "content"],
      additionalProperties: false,
    },
    async execute(input: JsonObject, signal: AbortSignal): Promise<ToolExecutionResult> {
      rejectUnknownFields(input, "write", ["path", "content"]);
      const requestedPath = requiredString(input, "write", "path");
      const content = input.content;
      if (typeof content !== "string") throw new ToolInputError("write: content must be a string");
      const bytes = Buffer.byteLength(content, "utf8");
      if (bytes > maxBytes) {
        throw new ToolInputError(`write: content is ${bytes} bytes; maximum is ${maxBytes}`);
      }

      return withFileMutationQueue(
        options.cwd,
        requestedPath,
        options.policy,
        async (path): Promise<ToolExecutionResult> => {
          signal.throwIfAborted();
          await mkdir(dirname(path), { recursive: true });
          signal.throwIfAborted();
          const temporary = `${path}.${randomUUID()}.axl-tmp`;
          try {
            const mode = await stat(path).then(
              (value) => value.mode & 0o777,
              (error: NodeJS.ErrnoException) => {
                if (error.code === "ENOENT") return 0o644;
                throw error;
              },
            );
            signal.throwIfAborted();
            await writeFile(temporary, content, { encoding: "utf8", mode, flag: "wx", signal });
            signal.throwIfAborted();
            await rename(temporary, path);
          } finally {
            await rm(temporary, { force: true });
          }

          return {
            content: [{ type: "text", text: `Wrote ${bytes} bytes to ${path}` }],
            isError: false,
            details: { path, bytes },
          };
        },
      );
    },
  };
}
