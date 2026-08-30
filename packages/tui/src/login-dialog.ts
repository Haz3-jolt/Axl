// SPDX-FileCopyrightText: 2026 Hari Srinivasan
// SPDX-License-Identifier: Apache-2.0

// In-app credential login as a dialog: one field active at a time, pasted
// values decoded clean, endpoint validated inline, and the key checked
// against the live Azure endpoint before anything claims success.

import {
  AZURE_OPENAI_PROVIDER_ID,
  azureOpenAiAuthMethod,
  type AuthContext,
  type CredentialStore,
  login,
  normalizeAzureBaseUrl,
  parseDeploymentMap,
  resolveProviderAuth,
  verifyAzureOpenAiAuth,
} from "@kepler/ai";

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
  private readonly fields: readonly Field[] = [
    { label: "API key ", mask: true, optional: false, value: "" },
    { label: "Endpoint", mask: false, optional: false, value: "" },
    { label: "Map     ", mask: false, optional: true, value: "" },
  ];
  private active = 0;
  private message: string | undefined;
  private verifying = false;

  constructor(options: LoginDialogOptions) {
    this.options = options;
  }

  render(): string[] {
    const { palette, width } = this.options;
    const { dim, accent, error } = palette;
    const rows: string[] = [
      dim("Saved to ~/.kepler/credentials.json (0600), redacted from logs."),
      "",
      ...this.fields.map((field, index) => {
        const shown = field.mask ? "*".repeat(field.value.length) : field.value;
        const hint = field.optional && field.value.length === 0 ? dim(" (optional)") : "";
        const line = `${field.label}  ${shown}${hint}`;
        return index === this.active && !this.verifying ? `${accent("❯")} ${line}` : `  ${line}`;
      }),
      "",
    ];
    if (this.verifying) rows.push(dim("Checking the key against Azure…"));
    else if (this.message !== undefined) rows.push(error(this.message));
    return renderDialog({
      title: "Azure OpenAI login",
      rows,
      footer: this.verifying ? "verifying…" : "Enter next · Esc cancel",
      width,
      palette,
    });
  }

  /** Cursor cell relative to the rendered dialog lines. */
  cursor(): CursorPlacement | undefined {
    if (this.verifying) return undefined;
    const field = this.fields[this.active] as Field;
    const shownLength = field.value.length;
    // dialog border(1) + info(1) + blank(1) + field rows above the active one
    return {
      row: 3 + this.active,
      column: 2 + 2 + field.label.length + 2 + shownLength,
    };
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
    const key = (this.fields[0] as Field).value.replace(/\s+/g, "");
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
      this.message = `Azure rejected the credentials${status} — check the key`;
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
