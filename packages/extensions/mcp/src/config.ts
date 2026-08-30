// SPDX-FileCopyrightText: 2026 Hari Srinivasan
// SPDX-License-Identifier: Apache-2.0

import { readFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";

const SERVER_NAME = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/;

export interface McpStdioServerConfig {
  readonly transport: "stdio";
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd?: string;
  /** Child environment variable to parent environment variable name. */
  readonly env: Readonly<Record<string, string>>;
  readonly roots: readonly string[];
  readonly enabled: boolean;
  readonly requestTimeoutMs: number;
}

export interface McpHttpOAuthConfig {
  readonly clientId?: string;
  readonly clientSecretEnv?: string;
  readonly scope?: string;
}

export interface McpHttpServerConfig {
  readonly transport: "http";
  readonly url: string;
  /** HTTP header to parent environment variable name. */
  readonly headers: Readonly<Record<string, string>>;
  readonly oauth?: McpHttpOAuthConfig;
  readonly roots: readonly string[];
  readonly enabled: boolean;
  readonly requestTimeoutMs: number;
}

export type McpServerConfig = McpStdioServerConfig | McpHttpServerConfig;

export interface NamedMcpServerConfig {
  readonly name: string;
  readonly config: McpServerConfig;
  readonly source: string;
}

export interface LoadMcpConfigOptions {
  readonly cwd: string;
  readonly globalDirectory?: string;
}

export class McpConfigError extends Error {
  constructor(path: string, message: string) {
    super(`${path}: ${message}`);
    this.name = "McpConfigError";
  }
}

function object(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new McpConfigError(path, "must be an object");
  }
  return value as Record<string, unknown>;
}

function exact(value: Record<string, unknown>, path: string, allowed: readonly string[]): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) throw new McpConfigError(`${path}.${key}`, "is not allowed");
  }
}

function string(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new McpConfigError(path, "must be a non-empty string");
  }
  return value;
}

function stringArray(value: unknown, path: string): readonly string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new McpConfigError(path, "must be an array of strings");
  }
  return value;
}

function stringMap(value: unknown, path: string): Readonly<Record<string, string>> {
  if (value === undefined) return {};
  const source = object(value, path);
  const result: Record<string, string> = {};
  for (const [key, item] of Object.entries(source)) result[key] = string(item, `${path}.${key}`);
  return result;
}

function timeout(value: unknown, path: string): number {
  if (value === undefined) return 60_000;
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    throw new McpConfigError(path, "must be a positive safe integer");
  }
  return value as number;
}

function enabled(value: unknown, path: string): boolean {
  if (value === undefined) return true;
  if (typeof value !== "boolean") throw new McpConfigError(path, "must be a boolean");
  return value;
}

function httpUrl(value: unknown, path: string): URL {
  let url: URL;
  try {
    url = new URL(string(value, path));
  } catch {
    throw new McpConfigError(path, "must be a valid URL");
  }
  return url;
}

function oauth(value: unknown, path: string): McpHttpOAuthConfig {
  const input = object(value, path);
  exact(input, path, ["clientId", "clientSecretEnv", "scope"]);
  return {
    ...(input.clientId === undefined
      ? {}
      : { clientId: string(input.clientId, `${path}.clientId`) }),
    ...(input.clientSecretEnv === undefined
      ? {}
      : { clientSecretEnv: string(input.clientSecretEnv, `${path}.clientSecretEnv`) }),
    ...(input.scope === undefined ? {} : { scope: string(input.scope, `${path}.scope`) }),
  };
}

function serverConfig(value: unknown, path: string, cwd: string): McpServerConfig {
  const input = object(value, path);
  const transport = string(input.transport, `${path}.transport`);
  if (transport === "stdio") {
    exact(input, path, [
      "transport",
      "command",
      "args",
      "cwd",
      "env",
      "roots",
      "enabled",
      "requestTimeoutMs",
    ]);
    const configuredCwd = input.cwd === undefined ? undefined : string(input.cwd, `${path}.cwd`);
    return {
      transport,
      command: string(input.command, `${path}.command`),
      args: stringArray(input.args, `${path}.args`),
      ...(configuredCwd === undefined
        ? {}
        : { cwd: isAbsolute(configuredCwd) ? configuredCwd : resolve(cwd, configuredCwd) }),
      env: stringMap(input.env, `${path}.env`),
      roots: stringArray(input.roots, `${path}.roots`).map((root) =>
        isAbsolute(root) ? resolve(root) : resolve(cwd, root),
      ),
      enabled: enabled(input.enabled, `${path}.enabled`),
      requestTimeoutMs: timeout(input.requestTimeoutMs, `${path}.requestTimeoutMs`),
    };
  }
  if (transport === "http") {
    exact(input, path, [
      "transport",
      "url",
      "headers",
      "oauth",
      "roots",
      "enabled",
      "requestTimeoutMs",
    ]);
    const url = httpUrl(input.url, `${path}.url`);
    if (
      url.protocol !== "https:" &&
      !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
    ) {
      throw new McpConfigError(
        `${path}.url`,
        "must use HTTPS, except for loopback development servers",
      );
    }
    if (url.username || url.password || url.hash) {
      throw new McpConfigError(`${path}.url`, "must not contain credentials or a fragment");
    }
    return {
      transport,
      url: url.href,
      headers: stringMap(input.headers, `${path}.headers`),
      ...(input.oauth === undefined ? {} : { oauth: oauth(input.oauth, `${path}.oauth`) }),
      roots: stringArray(input.roots, `${path}.roots`).map((root) =>
        isAbsolute(root) ? resolve(root) : resolve(cwd, root),
      ),
      enabled: enabled(input.enabled, `${path}.enabled`),
      requestTimeoutMs: timeout(input.requestTimeoutMs, `${path}.requestTimeoutMs`),
    };
  }
  throw new McpConfigError(`${path}.transport`, "must be stdio or http");
}

async function readConfig(path: string, cwd: string): Promise<NamedMcpServerConfig[]> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch (cause) {
    throw new McpConfigError(path, `invalid JSON: ${String(cause)}`);
  }
  const root = object(parsed, path);
  exact(root, path, ["servers"]);
  const servers = object(root.servers, `${path}.servers`);
  const result: NamedMcpServerConfig[] = [];
  for (const [name, value] of Object.entries(servers)) {
    if (!SERVER_NAME.test(name)) {
      throw new McpConfigError(`${path}.servers.${name}`, "server name is invalid");
    }
    const config = serverConfig(value, `${path}.servers.${name}`, cwd);
    result.push({ name, config, source: path });
  }
  return result;
}

export function mcpSecretValues(
  servers: readonly NamedMcpServerConfig[],
  env: Readonly<Record<string, string | undefined>> = process.env,
): readonly string[] {
  const names = new Set<string>();
  for (const server of servers) {
    if (server.config.transport === "stdio") {
      for (const source of Object.values(server.config.env)) names.add(source);
    } else {
      for (const source of Object.values(server.config.headers)) names.add(source);
      if (server.config.oauth?.clientSecretEnv) names.add(server.config.oauth.clientSecretEnv);
    }
  }
  return [...new Set([...names].flatMap((name) => (env[name] ? [env[name] as string] : [])))];
}

/** Global configuration is loaded first; project entries replace matching server names. */
export async function loadMcpConfig(
  options: LoadMcpConfigOptions,
): Promise<readonly NamedMcpServerConfig[]> {
  const merged = new Map<string, NamedMcpServerConfig>();
  for (const path of [
    ...(options.globalDirectory === undefined ? [] : [join(options.globalDirectory, "mcp.json")]),
    join(resolve(options.cwd), ".kepler", "mcp.json"),
  ]) {
    for (const server of await readConfig(path, options.cwd)) merged.set(server.name, server);
  }
  return [...merged.values()]
    .filter((server) => server.config.enabled)
    .sort((left, right) => left.name.localeCompare(right.name));
}
