// SPDX-FileCopyrightText: 2026 Hari Srinivasan
// SPDX-License-Identifier: Apache-2.0

import { createHash } from "node:crypto";

import type { DialectBoundaryReason, EventPayloadMap, JsonObject } from "@axl/protocol";

import type { ToolDeclaration } from "./model.ts";

export class ToolDialectError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolDialectError";
  }
}

/** Per-tool rendering overrides in a dialect data file. */
export interface ToolDialectOverride {
  readonly name?: string;
  readonly description?: string;
  readonly inputSchema?: JsonObject;
}

/** Provider-visible tool-name constraints a dialect enforces. */
export interface ToolNameRule {
  /** Regex character-class source of allowed characters, e.g. `a-zA-Z0-9_-`. */
  readonly allowed: string;
  readonly maxLength: number;
}

/**
 * A tool dialect is hot-swappable data, not code: how a model family expects
 * tool names and schemas to look. Rendering never changes canonical identity —
 * the kernel, policy, sandbox, and log always see canonical tools.
 */
export interface ToolDialectData {
  readonly id: string;
  readonly nameRule?: ToolNameRule;
  /** Per-canonical-tool overrides; tools without an entry render unchanged. */
  readonly tools?: Readonly<Record<string, ToolDialectOverride>>;
}

export const GENERIC_TOOL_DIALECT: ToolDialectData = { id: "generic" };

/** The dialect of the first real model, Azure OpenAI: function-tool naming rules. */
export const OPENAI_CHAT_TOOL_DIALECT: ToolDialectData = {
  id: "openai-chat",
  nameRule: { allowed: "a-zA-Z0-9_-", maxLength: 64 },
};

/** Validates dialect data loaded from a file. Loud on any malformed field. */
export function parseToolDialect(value: unknown): ToolDialectData {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ToolDialectError("A tool dialect must be an object");
  }
  const dialect = value as Record<string, unknown>;
  if (typeof dialect.id !== "string" || dialect.id.length === 0) {
    throw new ToolDialectError("A tool dialect requires a non-empty id");
  }
  if (dialect.nameRule !== undefined) {
    const rule = dialect.nameRule as Record<string, unknown>;
    if (
      typeof rule !== "object" ||
      rule === null ||
      typeof rule.allowed !== "string" ||
      rule.allowed.length === 0 ||
      !Number.isSafeInteger(rule.maxLength) ||
      (rule.maxLength as number) < 1
    ) {
      throw new ToolDialectError(`Dialect ${dialect.id} has an invalid nameRule`);
    }
  }
  if (dialect.tools !== undefined) {
    if (typeof dialect.tools !== "object" || dialect.tools === null) {
      throw new ToolDialectError(`Dialect ${dialect.id} has invalid tool overrides`);
    }
    for (const [canonicalName, override] of Object.entries(dialect.tools)) {
      const entry = override as Record<string, unknown>;
      if (typeof entry !== "object" || entry === null) {
        throw new ToolDialectError(
          `Dialect ${dialect.id} override for ${canonicalName} is invalid`,
        );
      }
      for (const key of ["name", "description"] as const) {
        if (entry[key] !== undefined && typeof entry[key] !== "string") {
          throw new ToolDialectError(
            `Dialect ${dialect.id} override for ${canonicalName} has a non-string ${key}`,
          );
        }
      }
    }
  }
  return value as ToolDialectData;
}

/**
 * Resolves the dialect for a model's declared API dialect. An unknown dialect
 * falls back to the generic rendering with `fellBack: true` so the caller can
 * surface it — the fallback is loud, never silent.
 */
export function resolveToolDialect(
  apiDialect: string,
  dialects: Readonly<Record<string, ToolDialectData>>,
): { dialect: ToolDialectData; fellBack: boolean } {
  const dialect = dialects[apiDialect];
  if (dialect !== undefined) return { dialect, fellBack: false };
  return { dialect: GENERIC_TOOL_DIALECT, fellBack: true };
}

export interface ProviderVisibleTool {
  /** Canonical identity — what dispatch, policy, and the log use. */
  readonly canonicalName: string;
  /** What the model sees. */
  readonly name: string;
  readonly description: string;
  readonly inputSchema: JsonObject;
}

function renderName(
  canonicalName: string,
  override: string | undefined,
  rule?: ToolNameRule,
): string {
  const requested = override ?? canonicalName;
  if (rule === undefined) return requested;
  const disallowed = new RegExp(`[^${rule.allowed}]+`, "g");
  const sanitized = requested.replace(disallowed, "_").slice(0, rule.maxLength);
  if (sanitized.length === 0) {
    throw new ToolDialectError(`Tool ${canonicalName} renders to an empty provider name`);
  }
  return sanitized;
}

/**
 * The provider-visible tool list, frozen between dialect boundaries. It is
 * rendered whole at a boundary — session start, model switch, or explicit
 * reload — and immutable until the next one, so the prompt prefix stays
 * byte-identical for the whole span. The fingerprint identifies the rendered
 * roster in `config.dialect` events.
 */
export class FrozenToolRoster {
  readonly dialectId: string;
  readonly tools: readonly ProviderVisibleTool[];
  readonly fingerprint: string;
  private readonly byProviderName: ReadonlyMap<string, ProviderVisibleTool>;
  private readonly byCanonicalName: ReadonlyMap<string, ProviderVisibleTool>;

  constructor(dialect: ToolDialectData, canonicalTools: readonly ToolDeclaration[]) {
    const rendered: ProviderVisibleTool[] = [];
    const byProviderName = new Map<string, ProviderVisibleTool>();
    const byCanonicalName = new Map<string, ProviderVisibleTool>();

    for (const tool of canonicalTools) {
      if (byCanonicalName.has(tool.name)) {
        throw new ToolDialectError(`Canonical tool ${tool.name} is declared twice`);
      }
      const override = dialect.tools?.[tool.name];
      const visible: ProviderVisibleTool = Object.freeze({
        canonicalName: tool.name,
        name: renderName(tool.name, override?.name, dialect.nameRule),
        description: override?.description ?? tool.description,
        inputSchema: override?.inputSchema ?? tool.inputSchema,
      });
      const collision = byProviderName.get(visible.name);
      if (collision !== undefined) {
        throw new ToolDialectError(
          `Dialect ${dialect.id} renders ${collision.canonicalName} and ${tool.name} to the same provider name ${visible.name}`,
        );
      }
      rendered.push(visible);
      byProviderName.set(visible.name, visible);
      byCanonicalName.set(tool.name, visible);
    }

    this.dialectId = dialect.id;
    this.tools = Object.freeze(rendered);
    this.byProviderName = byProviderName;
    this.byCanonicalName = byCanonicalName;
    this.fingerprint = createHash("sha256")
      .update(JSON.stringify({ dialectId: dialect.id, tools: rendered }))
      .digest("hex");
    Object.freeze(this);
  }

  /** Maps a provider-visible name back to canonical identity. Loud on unknown names. */
  toCanonical(providerName: string): string {
    const tool = this.byProviderName.get(providerName);
    if (tool === undefined) {
      throw new ToolDialectError(`Provider tool name ${providerName} is not in the frozen roster`);
    }
    return tool.canonicalName;
  }

  /** The provider-visible rendering of a canonical tool. Loud on unknown tools. */
  toProvider(canonicalName: string): ProviderVisibleTool {
    const tool = this.byCanonicalName.get(canonicalName);
    if (tool === undefined) {
      throw new ToolDialectError(`Canonical tool ${canonicalName} is not in the frozen roster`);
    }
    return tool;
  }
}

/**
 * The `config.dialect` payload for a dialect boundary. Every boundary — and
 * therefore every prompt-cache break — is logged with the roster fingerprint.
 */
export function dialectBoundaryPayload(
  roster: FrozenToolRoster,
  reason: DialectBoundaryReason,
): EventPayloadMap["config.dialect"] {
  return {
    dialectId: roster.dialectId,
    rosterFingerprint: roster.fingerprint,
    reason,
  };
}
