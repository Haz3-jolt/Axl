// SPDX-FileCopyrightText: 2026 Hari Srinivasan
// SPDX-License-Identifier: Apache-2.0

// In-app credential login as a dialog: one field active at a time, pasted
// values decoded clean, endpoint validated inline, and the key checked
// against the live Azure endpoint before anything claims success.

import {
  type ApiKeyCredential,
  type AuthContext,
  AZURE_OPENAI_PROVIDER_ID,
  azureOpenAiAuthMethod,
  type CredentialStore,
  login,
  normalizeAzureBaseUrl,
  parseDeploymentMap,
  resolveProviderAuth,
  verifyAzureOpenAiAuth,
} from "@axl/ai";

import { renderDialog } from "./dialog.ts";
import { decodeOneKey } from "./editor.ts";
import type { CursorPlacement } from "./render.ts";
import type { Palette } from "./transcript.ts";

interface Field {
  readonly label: string;
  readonly mask: boolean;
  readonly optional: boolean;
  value: string;
}

export interface LoginDialogOptions {
  readonly store: CredentialStore;
  readonly context: AuthContext;
  readonly fetch?: typeof fetch;
  readonly currentCredential?: ApiKeyCredential;
  readonly palette: Palette;
  readonly width: number;
  /** Repaint request while async verification progresses. */
  readonly refresh: () => void;
  /** Called once with a transcript line when the dialog finishes. */
  readonly close: (summary: string) => void;
}

/** The `/login` modal: renders as a dialog, verifies against Azure, then closes. */
export class LoginDialog {
  private readonly options: LoginDialogOptions;
  private readonly fields: readonly Field[];
  private active = 0;
  private message: string | undefined;
  private verifying = false;

  constructor(options: LoginDialogOptions) {
    this.options = options;
    this.fields = [
      {
        label: "API key",
        mask: true,
        optional: options.currentCredential?.key !== undefined,
        value: "",
      },
      {
        label: "Endpoint",
        mask: false,
        optional: false,
        value: options.currentCredential?.env?.AZURE_OPENAI_BASE_URL ?? "",
      },
      {
        label: "Deployment map",
        mask: false,
        optional: true,
        value: options.currentCredential?.env?.AZURE_OPENAI_DEPLOYMENT_NAME_MAP ?? "",
      },
    ];
  }

  render(width = this.options.width): string[] {
    const { palette } = this.options;
    const { dim, accent, error } = palette;
    const field = this.fields[this.active] as Field;
    const shown = field.mask ? "*".repeat(field.value.length) : field.value;
    const prompts = [
      this.options.currentCredential?.key
        ? "Enter a new Azure OpenAI API key, or leave blank to keep the stored key"
        : "Enter Azure OpenAI API key",
      "Enter Azure OpenAI endpoint",
      "Map model IDs to Azure deployment names (optional)",
    ] as const;
    const examples = [
      "Stored globally in ~/.axl/credentials.json and used in every workspace.",
      "Example: https://your-resource.openai.azure.com/",
      "Format: gpt-5.6-sol=my-deployment[,model=deployment]",
    ] as const;
    const rows = this.verifying
      ? [dim("Checking the credentials against Azure…")]
      : [
          prompts[this.active] as string,
          `${accent(">")} ${shown}`,
          dim(examples[this.active] as string),
          ...(this.message === undefined ? [] : [error(this.message)]),
        ];
    return renderDialog({
      title: "Login to Azure OpenAI",
      rows,
      footer: this.verifying ? "verifying…" : "escape/ctrl+c cancel · enter continue",
      width,
      palette,
    });
  }

  /** Cursor cell relative to the rendered dialog lines. */
  cursor(): CursorPlacement | undefined {
    if (this.verifying) return undefined;
    const field = this.fields[this.active] as Field;
    return { row: 5, column: 4 + field.value.length };
  }

  handleKey(data: string): void {
    if (this.verifying) return;
    const field = this.fields[this.active] as Field;
    let index = 0;
    while (index < data.length) {
      const { key, next } = decodeOneKey(data, index);
      index = next;
      if (
        key.kind === "escape" ||
        (key.kind === "ctrl" && (key.char === "c" || key.char === "d"))
      ) {
        this.options.close("· login cancelled");
        return;
      }
      if (key.kind === "backspace") {
        field.value = field.value.slice(0, -1);
      } else if (key.kind === "char") {
        field.value += key.char;
      } else if (key.kind === "up") {
        this.active = Math.max(0, this.active - 1);
        return;
      } else if (key.kind === "enter") {
        this.advance();
        return;
      }
      // Paste markers and other escapes contribute nothing.
    }
  }

  private advance(): void {
    const field = this.fields[this.active] as Field;
    this.message = undefined;
    if (field.value.trim().length === 0 && !field.optional) {
      this.message = `${field.label.trim()} is required`;
      return;
    }
    if (this.active === 1) {
      try {
        normalizeAzureBaseUrl(this.fields[1]?.value ?? "");
      } catch {
        this.message = "That is not a valid URL";
        return;
      }
    }
    if (this.active < this.fields.length - 1) {
      this.active += 1;
      return;
    }
    void this.finish();
  }

  private async finish(): Promise<void> {
    const key =
      (this.fields[0] as Field).value.replace(/\s+/g, "") || this.options.currentCredential?.key;
    if (!key) {
      this.message = "API key is required";
      this.active = 0;
      return;
    }
    const baseUrl = normalizeAzureBaseUrl((this.fields[1] as Field).value);
    const map = (this.fields[2] as Field).value.trim();
    const mapValid = map.length > 0 && Object.keys(parseDeploymentMap(map)).length > 0;

    this.verifying = true;
    this.options.refresh();
    try {
      await login(this.options.store, AZURE_OPENAI_PROVIDER_ID, {
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
        this.options.store,
        this.options.context,
      );
      const verification = await verifyAzureOpenAiAuth(resolved, this.options.fetch ?? fetch);
      if (verification.ok) {
        this.options.close("✓ credentials verified with Azure");
        return;
      }
      const status = verification.status === undefined ? "" : ` (HTTP ${verification.status})`;
      this.verifying = false;
      this.message = `Azure rejected the credentials${status}. Check the key`;
      this.active = 0;
      (this.fields[0] as Field).value = "";
      this.options.refresh();
    } catch (cause) {
      this.verifying = false;
      this.message = cause instanceof Error ? cause.message : "login failed";
      this.options.refresh();
    }
  }
}
