// SPDX-FileCopyrightText: 2026 Hari Srinivasan
// SPDX-License-Identifier: Apache-2.0

import { AxlClient, type SessionId } from "@axl/sdk";
import { BrowserWebSocketTransportFactory } from "@axl/sdk/browser";

export interface WebPreferences {
  readonly sidebarWidth: number;
  readonly changesWidth: number;
  readonly sidebarCollapsed: boolean;
  readonly changesView: "files" | "all";
}

export interface WebBootstrap {
  readonly cwd: string;
  readonly webSocketPath: string;
  readonly preferences: WebPreferences;
}

function fragment(): { readonly token?: string; readonly sessionId?: string } {
  const values = new URLSearchParams(location.hash.slice(1));
  const token = values.get("token") ?? undefined;
  const sessionId = values.get("session") ?? undefined;
  history.replaceState(null, "", `${location.pathname}${location.search}`);
  return {
    ...(token === undefined ? {} : { token }),
    ...(sessionId === undefined ? {} : { sessionId }),
  };
}

async function json<Response>(path: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(path, { credentials: "same-origin", ...init });
  if (!response.ok)
    throw new Error((await response.text()) || `Request failed (${response.status})`);
  return response.json() as Promise<Response>;
}

export function parseWebPreferences(value: unknown): WebPreferences {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error("Invalid web preferences");
  const preferences = value as Record<string, unknown>;
  if (
    !Number.isInteger(preferences.sidebarWidth) ||
    Number(preferences.sidebarWidth) < 200 ||
    Number(preferences.sidebarWidth) > 420 ||
    !Number.isInteger(preferences.changesWidth) ||
    Number(preferences.changesWidth) < 420 ||
    Number(preferences.changesWidth) > 900 ||
    typeof preferences.sidebarCollapsed !== "boolean" ||
    (preferences.changesView !== "files" && preferences.changesView !== "all")
  )
    throw new Error("Invalid web preferences");
  return value as WebPreferences;
}

export function parseBootstrap(value: unknown): WebBootstrap {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error("Invalid web bootstrap response");
  const record = value as Record<string, unknown>;
  if (typeof record.cwd !== "string" || typeof record.webSocketPath !== "string")
    throw new Error("Invalid web bootstrap response");
  return {
    cwd: record.cwd,
    webSocketPath: record.webSocketPath,
    preferences: parseWebPreferences(record.preferences),
  };
}

export async function saveWebPreferences(preferences: WebPreferences): Promise<void> {
  await json("preferences", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(preferences),
  });
}

export async function connectWebEnvironment(): Promise<{
  readonly client: AxlClient;
  readonly bootstrap: WebBootstrap;
  readonly selectedSessionId?: SessionId;
}> {
  const selected = fragment();
  if (selected.token !== undefined) {
    await json("auth/exchange", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: selected.token }),
    });
  }
  const bootstrap = parseBootstrap(await json<unknown>("bootstrap", { method: "POST" }));
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const client = await AxlClient.connect({
    transport: new BrowserWebSocketTransportFactory(
      `${protocol}//${location.host}${new URL(bootstrap.webSocketPath, location.href).pathname}`,
    ),
    identity: { kind: "web", version: "0.0.0", instanceId: crypto.randomUUID() },
    idempotencyKeys: { create: () => crypto.randomUUID() },
  });
  return {
    client,
    bootstrap,
    ...(selected.sessionId === undefined
      ? {}
      : { selectedSessionId: selected.sessionId as SessionId }),
  };
}
