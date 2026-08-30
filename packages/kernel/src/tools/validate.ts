// SPDX-FileCopyrightText: 2026 Hari Srinivasan
// SPDX-License-Identifier: Apache-2.0

import type { JsonObject } from "@kepler/protocol";

/** Invalid tool input. Thrown before execution; the loop records it as an error result. */
export class ToolInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolInputError";
  }
}

export function rejectUnknownFields(
  input: JsonObject,
  toolName: string,
  allowed: readonly string[],
): void {
  for (const key of Object.keys(input)) {
    if (!allowed.includes(key)) {
      throw new ToolInputError(`${toolName}: unknown input field ${JSON.stringify(key)}`);
    }
  }
}

export function requiredString(input: JsonObject, toolName: string, key: string): string {
  const value = input[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new ToolInputError(`${toolName}: ${key} must be a non-empty string`);
  }
  return value;
}

export function optionalString(
  input: JsonObject,
  toolName: string,
  key: string,
): string | undefined {
  const value = input[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    throw new ToolInputError(`${toolName}: ${key} must be a string`);
  }
  return value;
}

export function optionalPositiveInteger(
  input: JsonObject,
  toolName: string,
  key: string,
): number | undefined {
  const value = input[key];
  if (value === undefined) return undefined;
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new ToolInputError(`${toolName}: ${key} must be a positive integer`);
  }
  return value as number;
}

export function optionalBoolean(
  input: JsonObject,
  toolName: string,
  key: string,
): boolean | undefined {
  const value = input[key];
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") {
    throw new ToolInputError(`${toolName}: ${key} must be a boolean`);
  }
  return value;
}
