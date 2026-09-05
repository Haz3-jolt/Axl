// SPDX-FileCopyrightText: 2026 Hari Srinivasan
// SPDX-License-Identifier: Apache-2.0

import { parseOperationId, parseSessionId, ProtocolValidationError } from "./event-envelope.ts";

/** Independent of the session wire version. Only trusted process hosts use this channel. */
export const HOST_CONTROL_VERSION = 1;

export interface HostContext {
  readonly sessionId?: string;
  readonly attachmentId?: string;
}

export interface DaemonHostStatus {
  readonly instanceId: string;
  readonly dataDirectory: string;
  readonly pid: number;
  readonly buildVersion: string;
  readonly wireVersion: number;
  readonly state: "running" | "stopping" | "stopped" | "failed";
  readonly revision: string;
  readonly busy: boolean;
  readonly confirmationRequired: boolean;
  readonly canForceTerminate: boolean;
  readonly sessions: readonly {
    readonly sessionId: string;
    readonly cwd: string;
    readonly busy: boolean;
    readonly queued: number;
  }[];
  readonly attachments: readonly {
    readonly attachmentId: string;
    readonly kind: string;
    readonly sessionIds: readonly string[];
  }[];
  readonly pendingRequests: number;
  readonly error?: string;
}

export type HostRequest = { readonly kind: "host.request"; readonly version: 1 } & (
  | { readonly method: "status"; readonly context: HostContext }
  | {
      readonly method: "shutdown";
      readonly context: HostContext;
      readonly instanceId: string;
      readonly revision: string;
      readonly interrupt: boolean;
      readonly confirmed: boolean;
    }
  | { readonly method: "force"; readonly instanceId: string }
);

export type HostResponse = { readonly kind: "host.response"; readonly version: 1 } & (
  | { readonly status: DaemonHostStatus }
  | { readonly error: { readonly code: string; readonly message: string } }
);

function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ProtocolValidationError("host", "expected an object");
  }
  for (const key of Object.keys(value)) {
    if (!keys.includes(key)) throw new ProtocolValidationError(`host.${key}`, "unknown field");
  }
  return value as Record<string, unknown>;
}

function text(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new ProtocolValidationError("host", "expected nonempty text");
  }
  return value;
}

function boolean(value: unknown): boolean {
  if (typeof value !== "boolean") throw new ProtocolValidationError("host", "expected boolean");
  return value;
}

function integer(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new ProtocolValidationError("host", "expected nonnegative integer");
  }
  return value as number;
}

function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new ProtocolValidationError("host", "expected array");
  return value;
}

function context(value: unknown): HostContext {
  const input = object(value, ["sessionId", "attachmentId"]);
  return {
    ...(input.sessionId === undefined ? {} : { sessionId: parseSessionId(input.sessionId) }),
    ...(input.attachmentId === undefined
      ? {}
      : { attachmentId: parseOperationId(input.attachmentId) }),
  };
}

export function parseHostRequest(value: unknown): HostRequest {
  const input = object(value, [
    "kind",
    "version",
    "method",
    "context",
    "instanceId",
    "revision",
    "interrupt",
    "confirmed",
  ]);
  if (input.kind !== "host.request" || input.version !== HOST_CONTROL_VERSION) {
    throw new ProtocolValidationError("host.version", "unsupported host-control version");
  }
  const base = { kind: "host.request" as const, version: HOST_CONTROL_VERSION } as const;
  if (input.method === "status") {
    object(value, ["kind", "version", "method", "context"]);
    return { ...base, method: "status", context: context(input.context) };
  }
  if (input.method === "shutdown") {
    return {
      ...base,
      method: "shutdown",
      context: context(input.context),
      instanceId: parseOperationId(input.instanceId),
      revision: text(input.revision),
      interrupt: boolean(input.interrupt),
      confirmed: boolean(input.confirmed),
    };
  }
  if (input.method === "force") {
    object(value, ["kind", "version", "method", "instanceId"]);
    return { ...base, method: "force", instanceId: parseOperationId(input.instanceId) };
  }
  throw new ProtocolValidationError("host.method", "unknown method");
}

export function parseHostResponse(value: unknown): HostResponse {
  const input = object(value, ["kind", "version", "status", "error"]);
  if (input.kind !== "host.response" || input.version !== HOST_CONTROL_VERSION) {
    throw new ProtocolValidationError("host.version", "unsupported host-control response");
  }
  const base = { kind: "host.response" as const, version: HOST_CONTROL_VERSION } as const;
  if (input.error !== undefined) {
    object(value, ["kind", "version", "error"]);
    const error = object(input.error, ["code", "message"]);
    return { ...base, error: { code: text(error.code), message: text(error.message) } };
  }
  const status = object(input.status, [
    "instanceId",
    "dataDirectory",
    "pid",
    "buildVersion",
    "wireVersion",
    "state",
    "revision",
    "busy",
    "confirmationRequired",
    "canForceTerminate",
    "sessions",
    "attachments",
    "pendingRequests",
    "error",
  ]);
  if (!["running", "stopping", "stopped", "failed"].includes(String(status.state))) {
    throw new ProtocolValidationError("host.state", "unknown lifecycle state");
  }
  return {
    ...base,
    status: {
      instanceId: parseOperationId(status.instanceId),
      dataDirectory: text(status.dataDirectory),
      pid: integer(status.pid),
      buildVersion: text(status.buildVersion),
      wireVersion: integer(status.wireVersion),
      state: status.state as DaemonHostStatus["state"],
      revision: text(status.revision),
      busy: boolean(status.busy),
      confirmationRequired: boolean(status.confirmationRequired),
      canForceTerminate: boolean(status.canForceTerminate),
      pendingRequests: integer(status.pendingRequests),
      sessions: array(status.sessions).map((value) => {
        const session = object(value, ["sessionId", "cwd", "busy", "queued"]);
        return {
          sessionId: parseSessionId(session.sessionId),
          cwd: text(session.cwd),
          busy: boolean(session.busy),
          queued: integer(session.queued),
        };
      }),
      attachments: array(status.attachments).map((value) => {
        const attachment = object(value, ["attachmentId", "kind", "sessionIds"]);
        return {
          attachmentId: parseOperationId(attachment.attachmentId),
          kind: text(attachment.kind),
          sessionIds: array(attachment.sessionIds).map((id) => parseSessionId(id)),
        };
      }),
      ...(status.error === undefined ? {} : { error: text(status.error) }),
    },
  };
}
