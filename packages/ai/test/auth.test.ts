// SPDX-FileCopyrightText: 2026 Hari Srinivasan
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import test from "node:test";

import {
  type ApiKeyAuthMethod,
  AuthError,
  type AuthContext,
  InMemoryCredentialStore,
  login,
  logout,
  type OAuthAuthMethod,
  type OAuthCredential,
  resolveProviderAuth,
} from "../src/index.ts";

const providerId = "azure";

function makeContext(env: Record<string, string> = {}): AuthContext {
  return {
    env: (name) => env[name],
    fileExists: () => Promise.resolve(false),
  };
}

/** Azure-shaped api-key method: stored key wins, environment is the fallback. */
const apiKeyMethod: ApiKeyAuthMethod = {
  displayName: "Azure OpenAI API key",
  resolve: async ({ context, credential }) => {
    const key = credential?.key ?? context.env("AZURE_OPENAI_API_KEY");
    if (key === undefined) return undefined;
    return {
      auth: { apiKey: key },
      source: credential?.key !== undefined ? "stored api key" : "AZURE_OPENAI_API_KEY",
      secretValues: [key],
    };
  },
};

function makeOAuthMethod(refreshed: OAuthCredential): OAuthAuthMethod & { refreshCount: number } {
  return {
    displayName: "Azure OAuth",
    refreshCount: 0,
    async refresh() {
      this.refreshCount += 1;
      return refreshed;
    },
    toAuth: (credential) => ({ headers: { Authorization: `Bearer ${credential.access}` } }),
  };
}

function validOAuth(access = "fresh-access"): OAuthCredential {
  return { type: "oauth", access, refresh: "fresh-refresh", expiresAt: Date.now() + 3_600_000 };
}

function expiringOAuth(): OAuthCredential {
  return {
    type: "oauth",
    access: "old-access",
    refresh: "old-refresh",
    expiresAt: Date.now() + 1_000,
  };
}

test("a stored api key owns the provider over the environment", async () => {
  const store = new InMemoryCredentialStore();
  await login(store, providerId, { type: "api_key", key: "stored-key" });
  const context = makeContext({ AZURE_OPENAI_API_KEY: "env-key" });

  const resolved = await resolveProviderAuth(providerId, { apiKey: apiKeyMethod }, store, context);
  assert.deepEqual(resolved.auth, { apiKey: "stored-key" });
  assert.equal(resolved.source, "stored api key");
  assert.deepEqual(resolved.secretValues, ["stored-key"]);
});

test("falls back to ambient environment only when nothing is stored", async () => {
  const store = new InMemoryCredentialStore();
  const context = makeContext({ AZURE_OPENAI_API_KEY: "env-key" });

  const resolved = await resolveProviderAuth(providerId, { apiKey: apiKeyMethod }, store, context);
  assert.deepEqual(resolved.auth, { apiKey: "env-key" });
  assert.equal(resolved.source, "AZURE_OPENAI_API_KEY");
});

test("reports not_configured loudly when no credential or ambient source exists", async () => {
  const store = new InMemoryCredentialStore();
  await assert.rejects(
    resolveProviderAuth(providerId, { apiKey: apiKeyMethod }, store, makeContext()),
    (error) => error instanceof AuthError && error.code === "not_configured",
  );
});

test("logout removes the credential and restores the ambient path", async () => {
  const store = new InMemoryCredentialStore();
  const context = makeContext({ AZURE_OPENAI_API_KEY: "env-key" });
  await login(store, providerId, { type: "api_key", key: "stored-key" });
  await logout(store, providerId);

  const resolved = await resolveProviderAuth(providerId, { apiKey: apiKeyMethod }, store, context);
  assert.equal(resolved.auth.apiKey, "env-key");
});

test("valid oauth resolves without refreshing and lists its tokens as secrets", async () => {
  const store = new InMemoryCredentialStore();
  const method = makeOAuthMethod(validOAuth());
  await login(store, providerId, validOAuth("current-access"));

  const resolved = await resolveProviderAuth(providerId, { oauth: method }, store, makeContext());
  assert.equal(method.refreshCount, 0);
  assert.deepEqual(resolved.auth.headers, { Authorization: "Bearer current-access" });
  assert.deepEqual(resolved.secretValues, ["current-access", "fresh-refresh"]);
});

test("expiring oauth refreshes exactly once across concurrent resolutions", async () => {
  const store = new InMemoryCredentialStore();
  const method = makeOAuthMethod(validOAuth());
  await login(store, providerId, expiringOAuth());

  const results = await Promise.all(
    [1, 2, 3].map(() => resolveProviderAuth(providerId, { oauth: method }, store, makeContext())),
  );
  assert.equal(method.refreshCount, 1);
  for (const resolved of results) {
    assert.deepEqual(resolved.auth.headers, { Authorization: "Bearer fresh-access" });
  }
  const stored = await store.read(providerId);
  assert.equal(stored?.type === "oauth" && stored.access, "fresh-access");
});

test("a failed refresh surfaces refresh_failed with no silent fallback", async () => {
  const store = new InMemoryCredentialStore();
  const method: OAuthAuthMethod = {
    displayName: "Azure OAuth",
    refresh: () => Promise.reject(new Error("invalid_grant")),
    toAuth: () => ({}),
  };
  await login(store, providerId, expiringOAuth());

  // The ambient env key exists but must not be used after a failed refresh.
  const context = makeContext({ AZURE_OPENAI_API_KEY: "env-key" });
  await assert.rejects(
    resolveProviderAuth(providerId, { oauth: method, apiKey: apiKeyMethod }, store, context),
    (error) =>
      error instanceof AuthError &&
      error.code === "refresh_failed" &&
      /log in again/.test(error.message),
  );
});

test("logging out between the optimistic check and the locked refresh reports not_configured", async () => {
  const store = new InMemoryCredentialStore();
  let refreshCalled = false;
  const method: OAuthAuthMethod = {
    displayName: "Azure OAuth",
    refresh: async (credential) => {
      refreshCalled = true;
      return credential;
    },
    toAuth: () => ({}),
  };
  await login(store, providerId, expiringOAuth());
  // Simulate a logout racing the resolution: the optimistic read sees the
  // expiring credential, then the entry is gone by the time the lock is held.
  const originalRead = store.read.bind(store);
  const racingStore = Object.assign(Object.create(store) as InMemoryCredentialStore, {
    read: async (id: string) => {
      const current = await originalRead(id);
      await logout(store, providerId);
      return current;
    },
  });

  await assert.rejects(
    resolveProviderAuth(providerId, { oauth: method }, racingStore, makeContext()),
    (error) =>
      error instanceof AuthError &&
      error.code === "not_configured" &&
      /logged out during refresh/.test(error.message),
  );
  assert.equal(refreshCalled, false);
});

test("a stored credential type without a matching method is not silently substituted", async () => {
  const store = new InMemoryCredentialStore();
  await login(store, providerId, validOAuth());

  await assert.rejects(
    resolveProviderAuth(providerId, { apiKey: apiKeyMethod }, store, makeContext()),
    (error) =>
      error instanceof AuthError &&
      error.code === "not_configured" &&
      /no matching auth method/.test(error.message),
  );
});

test("resolution failures surface invalid_auth with the provider named", async () => {
  const store = new InMemoryCredentialStore();
  const failing: ApiKeyAuthMethod = {
    displayName: "Azure OpenAI API key",
    resolve: () => Promise.reject(new Error("credential file unreadable")),
  };
  await login(store, providerId, { type: "api_key", key: "stored-key" });

  await assert.rejects(
    resolveProviderAuth(providerId, { apiKey: failing }, store, makeContext()),
    (error) =>
      error instanceof AuthError &&
      error.code === "invalid_auth" &&
      error.providerId === providerId,
  );
});
