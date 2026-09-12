// SPDX-FileCopyrightText: 2026 Hari Srinivasan
// SPDX-License-Identifier: Apache-2.0

import { useState } from "react";
import type { InteractionAction, JsonObject, JsonValue, ProjectedInteraction } from "@axl/sdk";

export type InteractionResponder = (
  interactionId: string,
  action: InteractionAction,
  content?: JsonObject,
) => Promise<void>;

function object(value: unknown): JsonObject | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as JsonObject
    : undefined;
}

function choices(schema: JsonObject): readonly { readonly value: string; readonly label: string }[] {
  if (Array.isArray(schema.enum)) {
    return schema.enum.flatMap((value) => typeof value === "string" ? [{ value, label: value }] : []);
  }
  const alternatives = Array.isArray(schema.oneOf) ? schema.oneOf : schema.anyOf;
  if (!Array.isArray(alternatives)) return [];
  return alternatives.flatMap((entry) => {
    const option = object(entry);
    return typeof option?.const === "string"
      ? [{ value: option.const, label: typeof option.title === "string" ? option.title : option.const }]
      : [];
  });
}

function initialValue(schema: JsonObject, required: boolean): JsonValue {
  if (schema.default !== undefined) return schema.default;
  if (!required) return null;
  if (schema.type === "boolean") return false;
  if (schema.type === "array") return [];
  return choices(schema)[0]?.value ?? "";
}

function safeUrl(data: JsonObject | undefined): string | undefined {
  const request = object(data?.request);
  const value = typeof data?.url === "string" ? data.url : typeof request?.url === "string" ? request.url : undefined;
  if (value === undefined) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) return url.href;
  } catch {
    return undefined;
  }
  return undefined;
}

function validateValue(name: string, schema: JsonObject, value: JsonValue, required: boolean): string | undefined {
  if ((value === "" || value === null) && !required) return undefined;
  if ((value === "" || value === null) && required) return `${name} is required`;
  if ((schema.type === "number" || schema.type === "integer") && typeof value !== "number") return `${name} must be a number`;
  if (schema.type === "integer" && typeof value === "number" && !Number.isInteger(value)) return `${name} must be an integer`;
  if (typeof value === "number" && typeof schema.minimum === "number" && value < schema.minimum) return `${name} must be at least ${schema.minimum}`;
  if (typeof value === "number" && typeof schema.maximum === "number" && value > schema.maximum) return `${name} must be at most ${schema.maximum}`;
  if (typeof value === "string" && typeof schema.minLength === "number" && value.length < schema.minLength) return `${name} is too short`;
  if (typeof value === "string" && typeof schema.maxLength === "number" && value.length > schema.maxLength) return `${name} is too long`;
  if (Array.isArray(value) && typeof schema.minItems === "number" && value.length < schema.minItems) return `${name} needs at least ${schema.minItems} choices`;
  if (Array.isArray(value) && typeof schema.maxItems === "number" && value.length > schema.maxItems) return `${name} allows at most ${schema.maxItems} choices`;
  return undefined;
}

function InteractionForm({ interaction, respond }: { readonly interaction: ProjectedInteraction; readonly respond: InteractionResponder }): React.JSX.Element {
  const requestData = object(interaction.request.payload.data?.request);
  const schema = object(requestData?.requestedSchema);
  const properties = object(schema?.properties) ?? {};
  const required = new Set(Array.isArray(schema?.required) ? schema.required.filter((value): value is string => typeof value === "string") : []);
  const fields = Object.entries(properties).flatMap(([name, value]) => {
    const fieldSchema = object(value);
    return fieldSchema === undefined ? [] : [{ name, schema: fieldSchema }];
  });
  const [values, setValues] = useState<Record<string, JsonValue>>(() => Object.fromEntries(fields.map((field) => [field.name, initialValue(field.schema, required.has(field.name))])));
  const [error, setError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState<InteractionAction>();

  const submit = async (action: InteractionAction): Promise<void> => {
    let content: JsonObject | undefined;
    if (action === "accept") {
      const next: Record<string, JsonValue> = {};
      for (const field of fields) {
        const value = values[field.name] ?? "";
        const message = validateValue(field.name, field.schema, value, required.has(field.name));
        if (message !== undefined) {
          setError(message);
          return;
        }
        if ((value !== "" && value !== null) || required.has(field.name)) next[field.name] = value;
      }
      content = next;
    }
    setSubmitting(true);
    setError(undefined);
    try {
      await respond(interaction.interactionId, action, content);
      setCompleted(action);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not submit the MCP response");
      setSubmitting(false);
    }
  };

  if (completed !== undefined) return <div className="notice system-notice"><strong>Interaction {completed}</strong><small>{interaction.request.payload.source} · {interaction.request.payload.message}</small></div>;
  if (schema === undefined) {
    return <InteractionApproval interaction={interaction} respond={respond} error="The MCP server supplied an unsupported form schema." />;
  }
  return <section className="interaction-card" aria-label="MCP input request">
    <header><span>MCP input</span><small>{interaction.request.payload.source}</small></header>
    <p>{interaction.request.payload.message}</p>
    <form onSubmit={(event) => { event.preventDefault(); void submit("accept"); }}>
      {fields.map((field) => {
        const title = typeof field.schema.title === "string" ? field.schema.title : field.name;
        const description = typeof field.schema.description === "string" ? field.schema.description : undefined;
        const options = field.schema.type === "array"
          ? choices(object(field.schema.items) ?? {})
          : choices(field.schema);
        const value = values[field.name] ?? "";
        if (field.schema.type === "boolean") return <label key={field.name}><span>{title}{required.has(field.name) && <b aria-label="required">*</b>}</span>{description && <small>{description}</small>}<select value={value === null ? "" : String(value)} onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.value === "" ? null : event.target.value === "true" }))}>{!required.has(field.name) && <option value="">Omit</option>}<option value="true">Yes</option><option value="false">No</option></select></label>;
        if (field.schema.type === "array") {
          const selected = Array.isArray(value) ? value : [];
          if (options.length > 0) return <fieldset key={field.name}><legend>{title}{required.has(field.name) && <b aria-label="required">*</b>}</legend>{description && <small>{description}</small>}{options.map((option) => <label className="interaction-choice" key={option.value}><input type="checkbox" checked={selected.includes(option.value)} onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.checked ? [...selected, option.value] : selected.filter((entry) => entry !== option.value) }))} /><span>{option.label}</span></label>)}</fieldset>;
          return <label key={field.name}><span>{title}{required.has(field.name) && <b aria-label="required">*</b>}</span>{description && <small>{description}</small>}<input type="text" required={required.has(field.name)} value={selected.join(", ")} placeholder="Comma-separated values" onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) }))} /></label>;
        }
        if (options.length > 0) return <label key={field.name}><span>{title}{required.has(field.name) && <b aria-label="required">*</b>}</span>{description && <small>{description}</small>}<select required={required.has(field.name)} value={value === null ? "" : String(value)} onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.value }))}>{!required.has(field.name) && <option value="">Omit</option>}{options.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label>;
        const numeric = field.schema.type === "number" || field.schema.type === "integer";
        return <label key={field.name}><span>{title}{required.has(field.name) && <b aria-label="required">*</b>}</span>{description && <small>{description}</small>}<input type={numeric ? "number" : "text"} required={required.has(field.name)} value={value === null ? "" : String(value)} step={field.schema.type === "integer" ? 1 : numeric ? "any" : undefined} min={typeof field.schema.minimum === "number" ? field.schema.minimum : undefined} max={typeof field.schema.maximum === "number" ? field.schema.maximum : undefined} minLength={typeof field.schema.minLength === "number" ? field.schema.minLength : undefined} maxLength={typeof field.schema.maxLength === "number" ? field.schema.maxLength : undefined} onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.value === "" ? (required.has(field.name) ? "" : null) : numeric ? Number(event.target.value) : event.target.value }))} /></label>;
      })}
      {error && <div className="interaction-error" role="alert">{error}</div>}
      <footer><button type="button" disabled={submitting} onClick={() => void submit("decline")}>Decline</button><button type="button" disabled={submitting} onClick={() => void submit("cancel")}>Cancel</button><button className="primary" type="submit" disabled={submitting}>{submitting ? "Submitting…" : "Submit"}</button></footer>
    </form>
  </section>;
}

function InteractionApproval({ interaction, respond, error: initialError }: { readonly interaction: ProjectedInteraction; readonly respond: InteractionResponder; readonly error?: string | undefined }): React.JSX.Element {
  const [error, setError] = useState(initialError);
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState<InteractionAction>();
  const url = safeUrl(interaction.request.payload.data);
  const submit = async (action: InteractionAction): Promise<void> => {
    setSubmitting(true);
    setError(undefined);
    try {
      await respond(interaction.interactionId, action);
      setCompleted(action);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not submit the MCP response");
      setSubmitting(false);
    }
  };
  if (completed !== undefined) return <div className="notice system-notice"><strong>Interaction {completed}</strong><small>{interaction.request.payload.source} · {interaction.request.payload.message}</small></div>;
  return <section className="interaction-card" aria-label="MCP approval request">
    <header><span>{interaction.request.payload.kind === "mcp_elicitation_url" ? "Browser authorization" : interaction.request.payload.kind.startsWith("mcp_sampling") ? "Model request" : "Approval required"}</span><small>{interaction.request.payload.source}</small></header>
    <p>{interaction.request.payload.message}</p>
    {url && <a className="interaction-url" href={url} target="_blank" rel="noreferrer">Open authorization page</a>}
    {interaction.request.payload.data && <details><summary>Request details</summary><pre>{JSON.stringify(interaction.request.payload.data, null, 2)}</pre></details>}
    {error && <div className="interaction-error" role="alert">{error}</div>}
    <footer><button type="button" disabled={submitting} onClick={() => void submit("decline")}>Decline</button><button type="button" disabled={submitting} onClick={() => void submit("cancel")}>Cancel</button>{initialError === undefined && <button className="primary" type="button" disabled={submitting} onClick={() => void submit("accept")}>{submitting ? "Submitting…" : "Accept"}</button>}</footer>
  </section>;
}

export function InteractionCard({ interaction, respond }: { readonly interaction: ProjectedInteraction; readonly respond?: InteractionResponder | undefined }): React.JSX.Element {
  const resolution = interaction.resolution;
  if (resolution !== undefined) return <div className="notice system-notice"><strong>Interaction {resolution.payload.action}</strong><small>{interaction.request.payload.source} · {interaction.request.payload.message}</small></div>;
  if (respond === undefined) return <div className="notice system-notice warning" role="status"><strong>Interaction required</strong><small>{interaction.request.payload.source} · {interaction.request.payload.message}</small></div>;
  return interaction.request.payload.kind === "mcp_elicitation_form"
    ? <InteractionForm interaction={interaction} respond={respond} />
    : <InteractionApproval interaction={interaction} respond={respond} />;
}
