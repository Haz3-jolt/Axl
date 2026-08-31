// SPDX-FileCopyrightText: 2026 Hari Srinivasan
// SPDX-License-Identifier: Apache-2.0

// First-run credential setup: interactive prompts instead of environment
// exports. Input is decoded like the editor's: bracketed-paste markers and
// escape sequences never leak into typed values. "Verified" means Azure
// actually accepted the key, checked with a token-free request.

import {
  type AuthContext,
  AZURE_OPENAI_PROVIDER_ID,
  azureOpenAiAuthMethod,
  type CredentialStore,
  login,
  normalizeAzureBaseUrl,
  parseDeploymentMap,
  resolveProviderAuth,
  verifyAzureOpenAiAuth,
} from "@kepler/ai";

import { decodeOneKey } from "./editor.ts";

export interface SetupInput {
  on(event: "data", listener: (chunk: Buffer | string) => void): unknown;
  off(event: "data", listener: (chunk: Buffer | string) => void): unknown;
  setRawMode?(mode: boolean): unknown;
}

export interface SetupOutput {
  write(data: string): unknown;
}

export class SetupAbortedError extends Error {
  constructor() {
    super("Setup aborted");
    this.name = "SetupAbortedError";
  }
}

export interface PromptOptions {
  readonly mask?: boolean;
  readonly allowEmpty?: boolean;
}

/**
 * Reads one line in raw mode through the editor's key decoder, so pasted
 * values arrive clean: bracketed-paste markers are consumed, escape sequences
 * are dropped, and pasted newlines end the line. Masked input echoes `*`;
 * Ctrl+C or Ctrl+D aborts.
 */
export function promptLine(
  input: SetupInput,
  output: SetupOutput,
  label: string,
  options: PromptOptions = {},
): Promise<string> {
  output.write(label);
  input.setRawMode?.(true);
  return new Promise<string>((resolve, reject) => {
    let buffer = "";
    const finish = (value: string): void => {
      output.write("\n");
      done();
      resolve(value);
    };
    const listener = (chunk: Buffer | string): void => {
      const data = chunk.toString("utf8");
      let index = 0;
      while (index < data.length) {
        const { key, next } = decodeOneKey(data, index);
        index = next;
        if (key.kind === "ctrl" && (key.char === "c" || key.char === "d")) {
          done();
          reject(new SetupAbortedError());
          return;
        }
        if (key.kind === "enter") {
          const value = buffer.trim();
          if (value.length === 0 && !options.allowEmpty) continue;
          finish(value);
          return;
        }
        if (key.kind === "backspace") {
          if (buffer.length > 0) {
            buffer = buffer.slice(0, -1);
            output.write("\b \b");
          }
        } else if (key.kind === "char") {
          buffer += key.char;
          output.write(options.mask ? "*" : key.char);
        }
        // Paste markers, arrows, and other escapes contribute nothing.
      }
    };
    const done = (): void => {
      input.off("data", listener);
    };
    input.on("data", listener);
  });
}

const VERIFY_ATTEMPTS = 3;

/**
 * Interactive Azure OpenAI setup. Prompts for the API key (masked, whitespace
 * stripped), the endpoint (normalized, with retries), and an optional
 * model→deployment map, then stores the credential and verifies it against
 * the live endpoint. A rejected key re-prompts instead of pretending success.
 */
export async function runAzureSetup(
  input: SetupInput,
  output: SetupOutput,
  store: CredentialStore,
  context: AuthContext,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  output.write(
    "\nAzure OpenAI setup: saved to ~/.kepler/credentials.json (0600), redacted from logs.\n\n",
  );

  for (let attempt = 1; attempt <= VERIFY_ATTEMPTS; attempt += 1) {
    const key = (await promptLine(input, output, "  API key: ", { mask: true })).replace(
      /\s+/g,
      "",
    );

    let baseUrl: string | undefined;
    while (baseUrl === undefined) {
      const raw = await promptLine(
        input,
        output,
        "  Endpoint (e.g. https://your-resource.openai.azure.com/ or your Foundry URL): ",
      );
      try {
        baseUrl = normalizeAzureBaseUrl(raw);
      } catch {
        output.write("  That is not a valid URL; try again.\n");
      }
    }

    const map = await promptLine(
      input,
      output,
      "  Model→deployment map, optional (e.g. gpt-5=my-deployment, Enter to skip): ",
      { allowEmpty: true },
    );
    const mapValid = map.length > 0 && Object.keys(parseDeploymentMap(map)).length > 0;
    if (map.length > 0 && !mapValid) {
      output.write("  Ignoring unparseable map; use model=deployment[,model=deployment].\n");
    }

    await login(store, AZURE_OPENAI_PROVIDER_ID, {
      type: "api_key",
      key,
      env: {
        AZURE_OPENAI_BASE_URL: baseUrl,
        ...(mapValid ? { AZURE_OPENAI_DEPLOYMENT_NAME_MAP: map } : {}),
      },
    });

    const resolved = await resolveProviderAuth(
      AZURE_OPENAI_PROVIDER_ID,
      { apiKey: azureOpenAiAuthMethod },
      store,
      context,
    );
    output.write("  Checking the key against Azure…\n");
    const verification = await verifyAzureOpenAiAuth(resolved, fetchImpl);
    if (verification.ok) {
      output.write("\n  ✓ Credentials verified with Azure.\n\n");
      return;
    }
    const status = verification.status === undefined ? "" : ` (HTTP ${verification.status})`;
    output.write(
      `\n  ✖ Azure rejected the credentials${status}: ${verification.detail ?? "no detail"}\n`,
    );
    if (attempt < VERIFY_ATTEMPTS) output.write("  Let's try again.\n\n");
  }
  output.write(
    "\n  Credentials saved but NOT verified. Fix them with /login or `kepler login`.\n\n",
  );
}
