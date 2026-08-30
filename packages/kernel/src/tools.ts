// SPDX-FileCopyrightText: 2026 Hari Srinivasan
// SPDX-License-Identifier: Apache-2.0

import type { JsonObject, JsonValue, ToolDeclaration, UserContent } from "@kepler/protocol";

export interface ToolExecutionResult {
  readonly content: readonly UserContent[];
  readonly isError: boolean;
  readonly details?: JsonValue;
}

/** A canonical tool: identity, schema, and execution. Dialect rendering is provider-side. */
export interface KernelTool extends ToolDeclaration {
  execute(input: JsonObject, signal: AbortSignal): Promise<ToolExecutionResult>;
}

export class ToolRegistryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolRegistryError";
  }
}

/**
 * Dispatch-registry membership is tool authority: a call is executable exactly
 * when its canonical name is registered here. Registration returns a disposer;
 * a disposer never removes a different tool registered later under the same
 * name.
 */
export class ToolRegistry {
  private readonly tools = new Map<string, KernelTool>();

  register(tool: KernelTool): () => void {
    if (this.tools.has(tool.name)) {
      throw new ToolRegistryError(`Tool ${tool.name} is already registered`);
    }
    this.tools.set(tool.name, tool);
    return () => {
      if (this.tools.get(tool.name) === tool) this.tools.delete(tool.name);
    };
  }

  get(name: string): KernelTool | undefined {
    return this.tools.get(name);
  }

  declarations(): readonly ToolDeclaration[] {
    return [...this.tools.values()].map(({ name, description, inputSchema }) => ({
      name,
      description,
      inputSchema,
    }));
  }
}
