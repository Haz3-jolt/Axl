// SPDX-FileCopyrightText: 2026 Hari Srinivasan
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";

import {
  type Credential,
  credentialSecretValues,
  CredentialStoreError,
  FileCredentialStore,
  InMemoryCredentialStore,
} from "../src/index.ts";

const apiKeyCredential: Credential = {
  type: "api_key",
  key: "secret-key",
  env: { AZURE_OPENAI_ENDPOINT: "https://example.openai.azure.com" },
};
const oauthCredential: Credential = {
  type: "oauth",
  access: "access-token",
  refresh: "refresh-token",
  expiresAt: 1_000,
};

async function temporaryStorePath(context: TestContext): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "axl-credentials-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  return join(directory, "store", "credentials.json");
}

test("persists credentials across store instances with restrictive permissions", async (context) => {
  const path = await temporaryStorePath(context);
  const store = new FileCredentialStore(path);
  await store.modify("azure", () => Promise.resolve(apiKeyCredential));
  await store.modify("github", () => Promise.resolve(oauthCredential));

  const reopened = new FileCredentialStore(path);
  assert.deepEqual(await reopened.read("azure"), apiKeyCredential);
  assert.deepEqual(await reopened.read("github"), oauthCredential);
  assert.equal((await stat(path)).mode & 0o777, 0o600);
  assert.equal(await stat(join(path, "..")).then((s) => s.mode & 0o777), 0o700);
});

test("list exposes metadata only, never secret values", async (context) => {
  const path = await temporaryStorePath(context);
  const store = new FileCredentialStore(path);
  await store.modify("azure", () => Promise.resolve(apiKeyCredential));

  const listed = await store.list();
  assert.deepEqual(listed, [{ providerId: "azure", type: "api_key" }]);
  assert.equal(JSON.stringify(listed).includes("secret-key"), false);
});

test("modify sees the current value, serializes writers, and skips writes on undefined", async (context) => {
  const path = await temporaryStorePath(context);
  const store = new FileCredentialStore(path);

  await Promise.all(
    [1, 2, 3].map((round) =>
      store.modify("azure", (current) =>
        Promise.resolve({
          type: "api_key",
          key: `${current?.type === "api_key" ? current.key : "start"}+${round}`,
        }),
      ),
    ),
  );
  const written = await store.read("azure");
  assert.equal(written?.type === "api_key" && written.key, "start+1+2+3");

  const unchanged = await store.modify("azure", () => Promise.resolve(undefined));
  assert.deepEqual(unchanged, written);
});

test("two store instances on one file cannot interleave a read-modify-write", async (context) => {
  const path = await temporaryStorePath(context);
  const first = new FileCredentialStore(path);
  const second = new FileCredentialStore(path);
  await first.modify("azure", () => Promise.resolve({ type: "api_key", key: "0" }));

  const bump = (store: FileCredentialStore) =>
    store.modify("azure", async (current) => {
      await new Promise((resolve) => setTimeout(resolve, 10)); // hold the lock
      const previous = current?.type === "api_key" ? Number(current.key) : Number.NaN;
      return { type: "api_key", key: String(previous + 1) };
    });

  await Promise.all([bump(first), bump(second)]);
  const final = await first.read("azure");
  assert.equal(final?.type === "api_key" && final.key, "2");
});

test("delete removes the credential and is a no-op when absent", async (context) => {
  const path = await temporaryStorePath(context);
  const store = new FileCredentialStore(path);
  await store.modify("azure", () => Promise.resolve(apiKeyCredential));

  await store.delete("azure");
  await store.delete("azure");
  assert.equal(await store.read("azure"), undefined);
  assert.deepEqual(await store.list(), []);
});

test("rejects corrupt store files and malformed credentials loudly", async (context) => {
  const path = await temporaryStorePath(context);
  const store = new FileCredentialStore(path);
  await store.modify("azure", () => Promise.resolve(apiKeyCredential));

  await writeFile(path, "not json");
  await assert.rejects(store.read("azure"), CredentialStoreError);

  await writeFile(path, JSON.stringify({ azure: { type: "oauth", access: "only" } }));
  await assert.rejects(store.read("azure"), CredentialStoreError);

  await writeFile(path, JSON.stringify({ azure: { type: "api_key", key: "x", extra: true } }));
  await assert.rejects(store.read("azure"), CredentialStoreError);
});

test("in-memory store matches the contract", async () => {
  const store = new InMemoryCredentialStore();
  await store.modify("azure", () => Promise.resolve(apiKeyCredential));
  assert.deepEqual(await store.read("azure"), apiKeyCredential);
  assert.deepEqual(await store.list(), [{ providerId: "azure", type: "api_key" }]);
  await store.delete("azure");
  assert.equal(await store.read("azure"), undefined);
});

test("credentialSecretValues covers keys and oauth tokens", () => {
  assert.deepEqual(credentialSecretValues(apiKeyCredential), ["secret-key"]);
  assert.deepEqual(credentialSecretValues(oauthCredential), ["access-token", "refresh-token"]);
  assert.deepEqual(credentialSecretValues({ type: "api_key" }), []);
});
