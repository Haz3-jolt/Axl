// SPDX-FileCopyrightText: 2026 Hari Srinivasan
// SPDX-License-Identifier: Apache-2.0

import { EVENT_FORMAT_VERSION } from "./version.ts";

declare const eventIdBrand: unique symbol;
declare const operationIdBrand: unique symbol;
declare const sessionIdBrand: unique symbol;

export type EventId = string & { readonly [eventIdBrand]: true };
export type OperationId = string & { readonly [operationIdBrand]: true };
export type SessionId = string & { readonly [sessionIdBrand]: true };

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

export type JsonObject = { readonly [key: string]: JsonValue };

export interface EventEnvelope<
  Type extends string = string,
  Payload extends JsonObject = JsonObject,
> {
  readonly version: typeof EVENT_FORMAT_VERSION;
  readonly id: EventId;
  readonly sessionId: SessionId;
  readonly operationId?: OperationId;
  readonly parentId: EventId | null;
  readonly timestamp: number;
  readonly type: Type;
  readonly payload: Payload;
}

export class ProtocolValidationError extends Error {
  readonly path: string;

  constructor(path: string, message: string) {
    super(`${path}: ${message}`);
    this.name = "ProtocolValidationError";
    this.path = path;
  }
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const eventTypePattern = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;
const maximumJsonDepth = 64;

function validationError(path: string, message: string): never {
  throw new ProtocolValidationError(path, message);
}

function parseId(value: unknown, path: string): string {
  if (typeof value !== "string" || !uuidPattern.test(value)) {
    validationError(path, "must be a lowercase RFC 9562 UUID");
  }
  return value;
}

export function parseEventId(value: unknown, path = "event.id"): EventId {
  return parseId(value, path) as EventId;
}

export function parseSessionId(value: unknown, path = "event.sessionId"): SessionId {
  return parseId(value, path) as SessionId;
}

export function parseOperationId(value: unknown, path = "event.operationId"): OperationId {
  return parseId(value, path) as OperationId;
}

function parseObject(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    validationError(path, "must be an object");
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    validationError(path, "must be a plain object");
  }
  return value as Record<string, unknown>;
}

function validateJson(value: unknown, path: string): asserts value is JsonValue {
  const pending: Array<{ value: unknown; path: string; depth: number }> = [
    { value, path, depth: 0 },
  ];
  const seen = new WeakSet<object>();

  while (pending.length > 0) {
    const current = pending.pop();
    if (!current) break;
    const { value: candidate, path: candidatePath, depth } = current;

    if (candidate === null || typeof candidate === "string" || typeof candidate === "boolean") {
      continue;
    }
    if (typeof candidate === "number") {
      if (!Number.isFinite(candidate)) validationError(candidatePath, "must be a finite number");
      continue;
    }
    if (typeof candidate !== "object") {
      validationError(candidatePath, "must be valid JSON");
    }
    if (depth >= maximumJsonDepth) {
      validationError(candidatePath, `must not exceed ${maximumJsonDepth} nested levels`);
    }
    if (seen.has(candidate)) validationError(candidatePath, "must not contain repeated references");
    seen.add(candidate);

    if (Array.isArray(candidate)) {
      for (const [index, item] of candidate.entries()) {
        pending.push({ value: item, path: `${candidatePath}[${index}]`, depth: depth + 1 });
      }
      continue;
    }

    const object = parseObject(candidate, candidatePath);
    for (const [key, item] of Object.entries(object)) {
      pending.push({ value: item, path: `${candidatePath}.${key}`, depth: depth + 1 });
    }
  }
}

export function parseEventEnvelope(value: unknown): EventEnvelope {
  const event = parseObject(value, "event");
  const allowedKeys = new Set([
    "version",
    "id",
    "sessionId",
    "operationId",
    "parentId",
    "timestamp",
    "type",
    "payload",
  ]);
  for (const key of Object.keys(event)) {
    if (!allowedKeys.has(key)) validationError(`event.${key}`, "is not allowed");
  }

  if (event.version !== EVENT_FORMAT_VERSION) {
    validationError("event.version", `must equal ${EVENT_FORMAT_VERSION}`);
  }
  const id = parseEventId(event.id);
  const sessionId = parseSessionId(event.sessionId);
  const parentId = event.parentId === null ? null : parseEventId(event.parentId, "event.parentId");
  if (!Number.isSafeInteger(event.timestamp) || (event.timestamp as number) < 0) {
    validationError("event.timestamp", "must be a non-negative safe integer");
  }
  if (
    typeof event.type !== "string" ||
    event.type.length > 128 ||
    !eventTypePattern.test(event.type)
  ) {
    validationError("event.type", "must be a lowercase event name of at most 128 characters");
  }

  const payload = parseObject(event.payload, "event.payload");
  validateJson(payload, "event.payload");
  const operationId = "operationId" in event ? parseOperationId(event.operationId) : undefined;

  return {
    version: EVENT_FORMAT_VERSION,
    id,
    sessionId,
    ...(operationId === undefined ? {} : { operationId }),
    parentId,
    timestamp: event.timestamp as number,
    type: event.type,
    payload,
  };
}
