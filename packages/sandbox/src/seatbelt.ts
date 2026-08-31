// SPDX-FileCopyrightText: 2026 Hari Srinivasan
// SPDX-License-Identifier: Apache-2.0

// macOS Seatbelt provider: per-command confinement through `sandbox-exec`
// profiles, the same mechanism the platform uses for its own app
// confinement. Weaker than the Linux provider — there is no namespace
// equivalent — and the reported control list says so honestly.

import { execFile } from "node:child_process";
import { promisify } from "node:util";

import {
  makeShellTool,
  type KernelTool,
  type ShellToolOptions,
  type WorkspacePolicy,
} from "@axl/kernel";
import type { EventPayloadMap } from "@axl/protocol";

import { allowlistedEnvironment, definedEnvironment } from "./environment.ts";
import { type SandboxedProcess, SandboxUnavailableError } from "./bubblewrap.ts";

const run = promisify(execFile);

/** The controls the Seatbelt provider actually enforces. No process namespaces. */
export const SEATBELT_CONTROLS: readonly string[] = [
  "filesystem.readonly-root",
  "filesystem.workspace-writes",
  "filesystem.protected-paths-unreadable",
  "network.none",
  "environment.cleared",
];

export interface SeatbeltCapabilities {
  readonly available: boolean;
  readonly reason?: string;
}

/** Detects Seatbelt by exercising `sandbox-exec` with a trivial profile. */
export async function detectSeatbelt(): Promise<SeatbeltCapabilities> {
  if (process.platform !== "darwin") {
    return { available: false, reason: `Seatbelt requires macOS, not ${process.platform}` };
  }
  try {
    await run("sandbox-exec", ["-p", "(version 1)(allow default)", "/usr/bin/true"]);
  } catch (error) {
    return {
      available: false,
      reason: `sandbox-exec probe failed: ${error instanceof Error ? error.message.split("\n")[0] : "unknown"}`,
    };
  }
  return { available: true };
}

/** Escapes a path for an SBPL string literal. */
function sbplString(path: string): string {
  return `"${path.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/**
 * Builds the SBPL profile for a workspace policy. Later rules win in SBPL,
 * so the shape is: allow everything, deny network, deny writes, re-allow
 * writes in the workspace and scratch paths, then deny both directions on
 * protected paths last so nothing re-allows them.
 */
export function buildSeatbeltProfile(policy: WorkspacePolicy): string {
  const writable = [policy.workspace, "/private/tmp", "/private/var/tmp", "/dev"]
    .map((path) => `(subpath ${sbplString(path)})`)
    .join(" ");
  const lines = [
    "(version 1)",
    "(allow default)",
    "(deny network*)",
    "(deny file-write*)",
    `(allow file-write* ${writable})`,
  ];
  for (const protectedPath of policy.protectedPaths) {
    const subject = `(subpath ${sbplString(protectedPath)})`;
    lines.push(`(deny file-write* ${subject})`);
    lines.push(`(deny file-read* ${subject})`);
  }
  return lines.join("\n");
}

/**
 * Builds the argv for one command: `sandbox-exec` applies the profile, then
 * `env -i` rebuilds the environment from the allowlist so nothing else leaks.
 */
export function buildSeatbeltArgv(
  policy: WorkspacePolicy,
  command: string,
  env: Readonly<Record<string, string | undefined>> = process.env,
): readonly string[] {
  return [
    "sandbox-exec",
    "-p",
    buildSeatbeltProfile(policy),
    "/usr/bin/env",
    "-i",
    ...allowlistedEnvironment(env),
    "bash",
    "-c",
    command,
  ];
}

export function buildSeatbeltProcess(
  policy: WorkspacePolicy,
  command: string,
  args: readonly string[],
  cwd: string,
  env: Readonly<Record<string, string | undefined>> = process.env,
): SandboxedProcess {
  return {
    command: "sandbox-exec",
    args: ["-p", buildSeatbeltProfile(policy), command, ...args],
    cwd,
    env: definedEnvironment(env),
  };
}

export interface SeatbeltShellOptions extends Omit<ShellToolOptions, "wrapCommand"> {
  readonly policy: WorkspacePolicy;
  readonly capabilities: SeatbeltCapabilities;
}

/** The sandboxed shell tool for macOS. Unavailable Seatbelt throws; no unwrapped fallback. */
export function makeSeatbeltShellTool(options: SeatbeltShellOptions): KernelTool {
  if (!options.capabilities.available) {
    throw new SandboxUnavailableError(options.capabilities.reason ?? "unknown");
  }
  const { policy, capabilities: _capabilities, ...shellOptions } = options;
  return makeShellTool({
    ...shellOptions,
    wrapCommand: (command) => buildSeatbeltArgv(policy, command),
  });
}

/** The `sandbox.configured` payload for this provider. */
export function seatbeltConfiguredPayload(
  capabilities: SeatbeltCapabilities,
): EventPayloadMap["sandbox.configured"] {
  return {
    provider: "seatbelt",
    enforced: capabilities.available,
    controls: capabilities.available ? [...SEATBELT_CONTROLS] : [],
  };
}
