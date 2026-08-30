// SPDX-FileCopyrightText: 2026 Hari Srinivasan
// SPDX-License-Identifier: Apache-2.0

import type { ModelProvider } from "./provider.ts";

export class ProviderRegistryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderRegistryError";
  }
}

/**
 * Runtime provider registration for the session and, later, extensions.
 * Registration returns a disposer that unregisters the provider and releases
 * its resources; disposing twice is a no-op, and a disposer never removes a
 * different provider registered later under the same ID.
 */
export class ProviderRegistry {
  private readonly providers = new Map<string, ModelProvider>();

  register(provider: ModelProvider): () => Promise<void> {
    if (this.providers.has(provider.id)) {
      throw new ProviderRegistryError(`Provider ${provider.id} is already registered`);
    }
    this.providers.set(provider.id, provider);
    return async () => {
      if (this.providers.get(provider.id) !== provider) return;
      this.providers.delete(provider.id);
      await provider.dispose?.();
    };
  }

  get(id: string): ModelProvider {
    const provider = this.providers.get(id);
    if (provider === undefined) {
      throw new ProviderRegistryError(`Provider ${id} is not registered`);
    }
    return provider;
  }

  has(id: string): boolean {
    return this.providers.has(id);
  }

  list(): readonly ModelProvider[] {
    return [...this.providers.values()];
  }
}
