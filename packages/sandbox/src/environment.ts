// SPDX-FileCopyrightText: 2026 Hari Srinivasan
// SPDX-License-Identifier: Apache-2.0

/** Environment variables allowed through to sandboxed commands. */
export const ENVIRONMENT_ALLOWLIST = ["PATH", "HOME", "TERM", "LANG", "USER", "SHELL"] as const;

export function allowlistedEnvironmentRecord(
  env: Readonly<Record<string, string | undefined>>,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const name of ENVIRONMENT_ALLOWLIST) {
    const value = env[name];
    if (value !== undefined) result[name] = value;
  }
  return result;
}

export function definedEnvironment(
  env: Readonly<Record<string, string | undefined>>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(env).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
}

/** The allowlisted subset of `env` as NAME=value pairs, in allowlist order. */
export function allowlistedEnvironment(
  env: Readonly<Record<string, string | undefined>>,
): readonly string[] {
  return Object.entries(allowlistedEnvironmentRecord(env)).map(
    ([name, value]) => `${name}=${value}`,
  );
}
