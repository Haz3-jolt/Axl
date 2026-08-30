// SPDX-FileCopyrightText: 2026 Hari Srinivasan
// SPDX-License-Identifier: Apache-2.0

import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

/** One named section of the stable prompt; loggable as a `prompt.section` event. */
export interface PromptSection {
  readonly name: string;
  readonly source: string;
  readonly content: string;
}

/** The stable prompt: frozen at session start, the prompt-cache prefix. */
export interface StablePrompt {
  readonly text: string;
  readonly sections: readonly PromptSection[];
}

export const DEFAULT_IDENTITY =
  "You are Kepler, a coding agent. You work directly in the user's repository with the tools listed below.";

/** Essential operating constraints — short, static, and free of feature instructions. */
export const ESSENTIAL_CONSTRAINTS: readonly string[] = [
  "Prefer small, verifiable steps and report what you actually did.",
  "When a command or edit fails, show the failure rather than working around it silently.",
  "Never fabricate file contents or command output.",
];

export interface StablePromptInput {
  readonly identity?: string;
  readonly cwd: string;
  /** Active tool names with one-line descriptions. Schemas travel to the provider separately. */
  readonly tools: readonly { readonly name: string; readonly description: string }[];
  /** Applicable AGENTS.md sections, e.g. from `loadAgentsInstructions`. */
  readonly instructions?: readonly PromptSection[];
  readonly constraints?: readonly string[];
}

/**
 * Builds the stable base prompt: identity, working directory, active tools,
 * applicable AGENTS.md, and essential constraints — nothing else. No subagent
 * section, no skill bodies, no feature instructions, no dynamic values that
 * would invalidate the prompt-cache prefix. Byte-identical for identical
 * input, by construction.
 */
export function buildStablePrompt(input: StablePromptInput): StablePrompt {
  const sections: PromptSection[] = [
    { name: "identity", source: "core", content: input.identity ?? DEFAULT_IDENTITY },
    { name: "workspace", source: "core", content: `Working directory: ${input.cwd}` },
    {
      name: "tools",
      source: "core",
      content:
        input.tools.length === 0
          ? "No tools are available."
          : `Available tools:\n${input.tools
              .map((tool) => `- ${tool.name}: ${tool.description}`)
              .join("\n")}`,
    },
    {
      name: "constraints",
      source: "core",
      content: (input.constraints ?? ESSENTIAL_CONSTRAINTS).map((line) => `- ${line}`).join("\n"),
    },
    ...(input.instructions ?? []),
  ];
  return {
    sections,
    text: sections.map((section) => section.content).join("\n\n"),
  };
}

export interface AgentsInstructionsInput {
  /** Project working directory; its `AGENTS.md` applies when present. */
  readonly cwd: string;
  /** Global instructions file, e.g. `~/.kepler/AGENTS.md`. Absent by default. */
  readonly globalPath?: string;
}

/** Reads the applicable AGENTS.md files. Missing files contribute zero sections. */
export async function loadAgentsInstructions(
  input: AgentsInstructionsInput,
): Promise<readonly PromptSection[]> {
  const candidates: readonly { name: string; path: string }[] = [
    ...(input.globalPath === undefined
      ? []
      : [{ name: "agents-global", path: resolve(input.globalPath) }]),
    { name: "agents-project", path: join(resolve(input.cwd), "AGENTS.md") },
  ];
  const sections: PromptSection[] = [];
  for (const candidate of candidates) {
    try {
      const content = (await readFile(candidate.path, "utf8")).trim();
      if (content.length > 0) {
        sections.push({ name: candidate.name, source: candidate.path, content });
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  return sections;
}
