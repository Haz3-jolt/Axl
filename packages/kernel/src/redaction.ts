// SPDX-FileCopyrightText: 2026 Hari Srinivasan
// SPDX-License-Identifier: Apache-2.0

import { type CanonicalEvent, type JsonObject, type JsonValue, parseEvent } from "@kepler/protocol";

export const SECRET_FIELD_LIST_VERSION = 1 as const;
export const REDACTED_VALUE = "[REDACTED]" as const;
export const SECRET_FIELD_NAMES = Object.freeze([
  "accessToken",
  "apiKey",
  "authorization",
  "clientSecret",
  "cookie",
  "credential",
  "credentials",
  "passphrase",
  "password",
  "privateKey",
  "proxyAuthorization",
  "refreshToken",
  "secret",
  "secretAccessKey",
  "secrets",
  "sessionToken",
  "setCookie",
  "token",
  "xApiKey",
] as const);

const normalizedSecretFields = new Set(
  SECRET_FIELD_NAMES.map((field) => field.toLowerCase().replaceAll(/[-_.]/g, "")),
);

function isSecretField(field: string): boolean {
  return normalizedSecretFields.has(field.toLowerCase().replaceAll(/[-_.]/g, ""));
}

function redactString(value: string, secretValues: readonly string[]): string {
  let redacted = value;
  for (const secret of secretValues) redacted = redacted.replaceAll(secret, REDACTED_VALUE);
  return redacted;
}

export function redactJsonValue(
  value: JsonValue,
  secretValues: readonly string[],
  redactFieldNames = true,
): JsonValue {
  if (typeof value === "string") return redactString(value, secretValues);
  if (Array.isArray(value)) {
    return value.map((item) => redactJsonValue(item, secretValues, redactFieldNames));
  }
  if (typeof value !== "object" || value === null) return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      redactFieldNames && isSecretField(key)
        ? REDACTED_VALUE
        : redactJsonValue(item, secretValues, redactFieldNames),
    ]),
  );
}

function normalizeSecretValues(values: readonly string[]): readonly string[] {
  if (values.some((value) => typeof value !== "string" || value.length === 0)) {
    throw new TypeError("Secret values must be non-empty strings");
  }
  return [...new Set(values)].sort((left, right) => right.length - left.length);
}

export function redactEventForStorage(
  value: unknown,
  secretValues: readonly string[] = [],
): CanonicalEvent {
  const event = structuredClone(parseEvent(value));
  const normalizedSecrets = normalizeSecretValues(secretValues);
  const payload =
    event.type === "tool.schema"
      ? {
          ...event.payload,
          name: redactString(event.payload.name, normalizedSecrets),
          description: redactString(event.payload.description, normalizedSecrets),
          inputSchema: redactJsonValue(
            event.payload.inputSchema,
            normalizedSecrets,
            false,
          ) as JsonObject,
        }
      : (redactJsonValue(event.payload, normalizedSecrets) as JsonObject);
  return parseEvent({ ...event, payload });
}
