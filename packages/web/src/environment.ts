// SPDX-FileCopyrightText: 2026 Hari Srinivasan
// SPDX-License-Identifier: Apache-2.0

import { AxlClient, type SessionId } from "@axl/sdk";
import { BrowserWebSocketTransportFactory } from "@axl/sdk/browser";

export interface WebBootstrap {
  readonly cwd: string;
  readonly webSocketPath: string;
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
  const bootstrap = await json<WebBootstrap>("bootstrap", { method: "POST" });
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
