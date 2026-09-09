// SPDX-FileCopyrightText: 2026 Hari Srinivasan
// SPDX-License-Identifier: Apache-2.0

import { useMemo, useState } from "react";
import type {
  BlobReference,
  CanonicalEvent,
  ConversationState,
  EventId,
  JsonObject,
  ProjectedInterruptDelivery,
  ProjectedQueueItem,
  ProjectedToolCall,
  ThinkingLevel,
  Usage,
} from "@axl/sdk";
import { editDiffRows } from "./diff.ts";
import { highlightLine, languageForPath } from "./syntax.ts";

export function contentText(content: readonly { readonly type: string; readonly text?: string }[]): string {
  return content.filter((item) => item.type === "text").map((item) => item.text ?? "").join("");
}

function HighlightedText({ text, query }: { readonly text: string; readonly query?: string | undefined }): React.JSX.Element {
  const needle = query?.trim();
  if (!needle) return <>{text}</>;
  const expression = new RegExp(`(${needle.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")})`, "giu");
  const normalized = needle.toLocaleLowerCase();
  return <>{text.split(expression).map((part, index) => part.toLocaleLowerCase() === normalized ? <mark key={index}>{part}</mark> : part)}</>;
}

interface ResponseAttribution {
  readonly provider?: string;
  readonly model?: string;
  readonly thinking?: ThinkingLevel;
  readonly startedAt?: number;
}

function compactNumber(value: number): string {
  return value >= 1000 ? `${(value / 1000).toFixed(value >= 10_000 ? 0 : 1)}k` : String(value);
}

function UsageDetails({ usage, attribution, endedAt }: { readonly usage: Usage; readonly attribution?: ResponseAttribution | undefined; readonly endedAt: number }): React.JSX.Element {
  const identity = attribution?.provider && attribution.model ? `${attribution.provider} / ${attribution.model}` : attribution?.model ?? "Unknown model";
  const promptTokens = usage.inputTokens + usage.cacheReadTokens + usage.cacheWriteTokens;
  const cacheHit = promptTokens === 0 ? "0.0%" : `${((usage.cacheReadTokens / promptTokens) * 100).toFixed(1)}%`;
  const elapsedMs = attribution?.startedAt === undefined ? undefined : Math.max(1, endedAt - attribution.startedAt);
  const throughput = elapsedMs === undefined || usage.outputTokens === 0 ? undefined : `${((usage.outputTokens * 1000) / elapsedMs).toFixed(1)} tok/s`;
  return <details className="response-usage">
    <summary><span>{identity}</span>{attribution?.thinking && <><i>·</i><span>{attribution.thinking}</span></>}<i>·</i><span>{usage.costUsd === undefined ? "Cost unavailable" : `$${usage.costUsd.toFixed(4)}`}</span></summary>
    <dl><div><dt>Input</dt><dd>{compactNumber(usage.inputTokens)}</dd></div><div><dt>Output</dt><dd>{compactNumber(usage.outputTokens)}</dd></div><div><dt>Cache read</dt><dd>{compactNumber(usage.cacheReadTokens)}</dd></div><div><dt>Cache hit</dt><dd>{cacheHit}</dd></div><div><dt>Speed</dt><dd>{throughput ?? "Unknown"}</dd></div><div><dt>Reasoning</dt><dd>{usage.reasoningTokens === undefined ? "Unknown" : compactNumber(usage.reasoningTokens)}</dd></div><div><dt>Cost</dt><dd>{usage.costUsd === undefined ? "Unknown" : `$${usage.costUsd.toFixed(4)}`}</dd></div></dl>
  </details>;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function Attachment({ blob, resolveBlobUrl }: { readonly blob: BlobReference; readonly resolveBlobUrl?: ((blob: BlobReference) => string | undefined) | undefined }): React.JSX.Element {
  const name = blob.name ?? "Attachment";
  const url = resolveBlobUrl?.(blob);
  if (blob.mediaType.startsWith("image/") && url !== undefined) {
    return <figure className="message-image"><img src={url} alt={name} /><figcaption><span>{name}</span><small>{formatBytes(blob.sizeBytes)}</small></figcaption></figure>;
  }
  return <div className="message-file"><span className="attachment-icon" aria-hidden="true"><svg viewBox="0 0 16 16"><path d="M3 2.5h7l3 3v8H3zM10 2.5v3h3" /></svg></span><span><strong>{name}</strong><small>{blob.mediaType} · {formatBytes(blob.sizeBytes)}</small></span></div>;
}

function MessageContent({ content, resolveBlobUrl, searchQuery }: { readonly content: readonly { readonly type: string; readonly text?: string; readonly blob?: BlobReference }[]; readonly resolveBlobUrl?: ((blob: BlobReference) => string | undefined) | undefined; readonly searchQuery?: string | undefined }): React.JSX.Element {
  return <>{content.map((item, index) => item.type === "text" ? <p key={index}><HighlightedText text={item.text ?? ""} query={searchQuery} /></p> : item.type === "blob" && item.blob !== undefined ? <Attachment key={`${item.blob.sha256}:${index}`} blob={item.blob} resolveBlobUrl={resolveBlobUrl} /> : null)}</>;
}

function ToolIcon({ intent, name }: { readonly intent: ProjectedToolCall["renderIntent"]; readonly name: string }): React.JSX.Element {
  if (intent === "shell") return <svg viewBox="0 0 16 16" aria-hidden="true"><rect x="1.75" y="2.25" width="12.5" height="11.5" rx="2" /><path d="m4.25 6 2 2-2 2M8.25 10h3" /></svg>;
  if (intent === "read") return <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 2.5h7l3 3v8H3zM10 2.5v3h3M5.5 8h5M5.5 10.5h5" /></svg>;
  if (name.toLocaleLowerCase() === "write") return <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 2.5h7l3 3v8H3zM10 2.5v3h3M8 8v4M6 10h4" /></svg>;
  if (intent === "edit") return <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m3 11.5-.5 2 2-.5 7.8-7.8-1.5-1.5zM9.8 4.7l1.5 1.5" /></svg>;
  if (intent === "web") return <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5.75" /><path d="M2.5 8h11M8 2.25c1.6 1.55 2.4 3.47 2.4 5.75S9.6 12.2 8 13.75C6.4 12.2 5.6 10.28 5.6 8S6.4 3.8 8 2.25" /></svg>;
  return <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="4" cy="4" r="1.5" /><circle cx="12" cy="8" r="1.5" /><circle cx="4" cy="12" r="1.5" /><path d="m5.5 4.6 5 2.8M5.5 11.4l5-2.8" /></svg>;
}

function field(input: JsonObject, name: string): string | undefined {
  const value = input[name];
  return typeof value === "string" ? value : undefined;
}

function toolTarget(tool: ProjectedToolCall): string {
  return field(tool.input, "path") ?? field(tool.input, "command") ?? field(tool.input, "url") ?? tool.name;
}

function toolVerb(tool: ProjectedToolCall): string {
  const name = tool.name.toLocaleLowerCase();
  if (name === "read") return "Read";
  if (name === "write") return "Wrote";
  if (name === "edit") return "Edited";
  if (name === "bash" || tool.renderIntent === "shell") return "Ran";
  if (tool.renderIntent === "web") return tool.result === undefined ? "Fetching" : "Fetched";
  return tool.result === undefined ? "Running" : "Ran";
}

function resultText(tool: ProjectedToolCall): string {
  return tool.result === undefined ? "" : contentText(tool.result.content);
}

function resultDetails(tool: ProjectedToolCall): JsonObject | undefined {
  const details = tool.result?.details;
  if (typeof details !== "object" || details === null || Array.isArray(details)) return undefined;
  return details as JsonObject;
}

function formatOutputSize(value: unknown): string | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? formatBytes(value) : undefined;
}

function TruncationNotice({ tool }: { readonly tool: ProjectedToolCall }): React.JSX.Element | null {
  const details = resultDetails(tool);
  const overflowPath = typeof details?.overflowPath === "string" ? details.overflowPath : undefined;
  const truncated = details?.truncated === true || overflowPath !== undefined;
  if (!truncated) return null;
  return <details className="truncation-notice">
    <summary><span aria-hidden="true"><svg viewBox="0 0 16 16"><path d="M8 2.5v7M8 12.5v.1M2.5 8a5.5 5.5 0 1 0 11 0 5.5 5.5 0 0 0-11 0Z" /></svg></span><strong>Output truncated</strong>{formatOutputSize(details?.outputBytes) && <small>{formatOutputSize(details?.outputBytes)} total</small>}<span className="truncation-action">Inspect</span></summary>
    <div><p>The visible result keeps a bounded excerpt of the complete output.</p>{overflowPath && <><small>Complete output preserved at</small><code>{overflowPath}</code></>}</div>
  </details>;
}

function CodeBlock({ text, numbered = false, path, language }: { readonly text: string; readonly numbered?: boolean; readonly path?: string | undefined; readonly language?: string | undefined }): React.JSX.Element {
  const resolvedLanguage = language ?? languageForPath(path);
  return <pre className={numbered ? "code-block numbered" : "code-block"}>{text.split("\n").map((line, index) => <span key={`${index}:${line}`} data-line={numbered ? index + 1 : undefined} dangerouslySetInnerHTML={{ __html: highlightLine(line || " ", resolvedLanguage) }} />)}</pre>;
}

function DiffView({ input }: { readonly input: JsonObject }): React.JSX.Element {
  const rows = editDiffRows(input);
  if (rows.length === 0) return <CodeBlock text={JSON.stringify(input, null, 2)} />;
  const removed = rows.filter((row) => row.kind === "remove").length;
  const added = rows.filter((row) => row.kind === "add").length;
  const path = field(input, "path");
  const language = languageForPath(path);
  return <div className="diff-file"><header><span>{path ?? "Edited file"}</span><span className="diff-stats"><i>−{removed}</i><b>+{added}</b></span></header><div className="diff" role="table" aria-label="Edit diff">{rows.map((row, index) => <div className={`diff-row ${row.kind}`} role="row" key={`${index}:${row.kind}:${row.text}`}><span className="line-number" role="cell">{row.oldLine ?? ""}</span><span className="line-number" role="cell">{row.newLine ?? ""}</span><span className="diff-sign" aria-hidden="true">{row.kind === "remove" ? "−" : row.kind === "add" ? "+" : ""}</span><code role="cell" dangerouslySetInnerHTML={{ __html: highlightLine(row.text || " ", language) }} /></div>)}</div></div>;
}

export function ToolEntry({ tool }: { readonly tool: ProjectedToolCall }): React.JSX.Element {
  const truncated = resultDetails(tool)?.truncated === true || typeof resultDetails(tool)?.overflowPath === "string";
  const [open, setOpen] = useState(tool.name.toLocaleLowerCase() === "edit" || truncated);
  const status = tool.result === undefined ? "running" : tool.result.isError ? "failed" : "complete";
  const output = resultText(tool);
  const command = field(tool.input, "command");
  const path = field(tool.input, "path");
  const content = field(tool.input, "content");
  const isWrite = tool.name.toLocaleLowerCase() === "write";
  return <details className={`tool-item ${status}`} open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary><span className="tool-chevron"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m6 3.5 4.5 4.5L6 12.5" /></svg></span><span className="tool-icon"><ToolIcon intent={tool.renderIntent} name={tool.name} /></span><span className="tool-heading"><strong>{toolVerb(tool)}</strong><small>{toolTarget(tool)}</small></span><span className="tool-status" aria-label={status}>{status === "running" ? <i></i> : status === "failed" ? <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8" /></svg> : <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m3 8 3 3 7-7" /></svg>}</span></summary>
    <div className="tool-body">
      {isWrite && content !== undefined ? <><div className="tool-label">New file</div><CodeBlock text={content} numbered path={path} /></> : tool.renderIntent === "edit" ? <DiffView input={tool.input} /> : tool.renderIntent === "shell" ? <><div className="tool-label">Command</div><CodeBlock text={command ?? JSON.stringify(tool.input, null, 2)} language="bash" />{output && <><div className="tool-label">Output</div><CodeBlock text={output} /></>}</> : tool.renderIntent === "read" ? <><div className="tool-label">{path ?? "Result"}</div><CodeBlock text={output || JSON.stringify(tool.input, null, 2)} numbered={Boolean(output)} path={path} /></> : content !== undefined ? <><div className="tool-label">Content</div><CodeBlock text={content} numbered path={path} /></> : <CodeBlock text={output || JSON.stringify(tool.input, null, 2)} {...(output ? {} : { language: "json" })} />}
      <TruncationNotice tool={tool} />
      {tool.result?.isError && <p className="tool-error">{output || "The tool failed without output."}</p>}
    </div>
  </details>;
}

function MessageActions({ eventId, text, fork, onCopy, onFork }: { readonly eventId: EventId; readonly text: string; readonly fork: boolean; readonly onCopy?: ((text: string) => void) | undefined; readonly onFork?: ((eventId: EventId) => void) | undefined }): React.JSX.Element | null {
  if (onCopy === undefined && (!fork || onFork === undefined)) return null;
  return <div className="message-actions">
    {onCopy && <button type="button" aria-label="Copy message" title="Copy" onClick={() => onCopy(text)}><svg viewBox="0 0 16 16" aria-hidden="true"><rect x="5.25" y="5.25" width="8" height="8" rx="1.5" /><path d="M10.75 5.25v-2A1.25 1.25 0 0 0 9.5 2h-6A1.5 1.5 0 0 0 2 3.5v6a1.25 1.25 0 0 0 1.25 1.25h2" /></svg></button>}
    {fork && onFork && <button type="button" aria-label="Fork from this message" title="Fork from here" onClick={() => onFork(eventId)}><svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="4" cy="3.5" r="1.5" /><circle cx="12" cy="5.5" r="1.5" /><circle cx="4" cy="12.5" r="1.5" /><path d="M4 5v6M5.5 6.5h3A3.5 3.5 0 0 0 12 3" /></svg></button>}
  </div>;
}

function DeliveryState({ label, status, text, reason }: { readonly label: string; readonly status: string; readonly text: string; readonly reason?: string | undefined }): React.JSX.Element {
  const failed = status === "failed";
  return <div className={`delivery-state ${failed ? "failed" : status}`} role={failed ? "alert" : "status"}><span className="delivery-icon" aria-hidden="true"><svg viewBox="0 0 16 16">{failed ? <path d="m4 4 8 8M12 4l-8 8" /> : status === "delivered" || status === "completed" ? <path d="m3 8 3 3 7-7" /> : status === "paused" ? <path d="M5 4v8M11 4v8" /> : <><circle cx="8" cy="8" r="5.5" /><path d="M8 4.5V8l2.5 1.5" /></>}</svg></span><span><strong>{label}</strong>{text && <small>{text}</small>}{reason && <small>{reason}</small>}</span></div>;
}

function EventRow({ event, queue, interruption, attribution, resolveBlobUrl, searchQuery, onCopyMessage, onForkMessage }: { readonly event: CanonicalEvent; readonly queue?: ProjectedQueueItem | undefined; readonly interruption?: ProjectedInterruptDelivery | undefined; readonly attribution?: ResponseAttribution | undefined; readonly resolveBlobUrl?: ((blob: BlobReference) => string | undefined) | undefined; readonly searchQuery?: string | undefined; readonly onCopyMessage?: ((text: string) => void) | undefined; readonly onForkMessage?: ((eventId: EventId) => void) | undefined }): React.JSX.Element | null {
  if (event.type === "user.message") return <article className="message user" id={`message-${event.id}`} data-prompt-id={event.id} data-prompt-text={contentText(event.payload.content)}><span className="avatar">Y</span><div><header><strong>You</strong><time>{new Date(event.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time></header><MessageContent content={event.payload.content} resolveBlobUrl={resolveBlobUrl} searchQuery={searchQuery} /><MessageActions eventId={event.id} text={contentText(event.payload.content)} fork onCopy={onCopyMessage} onFork={onForkMessage} /></div></article>;
  if (event.type === "assistant.message") return <article className="message assistant" id={`message-${event.id}`}><span className="avatar axl">◆</span><div><header><strong>Axl</strong><time>{new Date(event.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time></header>{event.payload.content.map((item, index) => item.type === "thinking" ? <details className="thinking" key={index}><summary><span className="tool-chevron"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m6 3.5 4.5 4.5L6 12.5" /></svg></span>Thinking</summary><p><HighlightedText text={item.text} query={searchQuery} /></p></details> : item.type === "text" ? <p key={index}><HighlightedText text={item.text} query={searchQuery} /></p> : item.type === "blob" ? <Attachment key={`${item.blob.sha256}:${index}`} blob={item.blob} resolveBlobUrl={resolveBlobUrl} /> : null)}{event.payload.stopReason === "aborted" && <DeliveryState label="Response interrupted" status="aborted" text="" />}{event.payload.stopReason === "length" && <div className="response-warning" role="status"><span aria-hidden="true"><svg viewBox="0 0 16 16"><path d="M8 2.25 14 13H2zM8 6v3.5M8 12v.1" /></svg></span><span><strong>Response incomplete</strong><small>The model reached its output limit. Ask it to continue or increase the output limit.</small></span></div>}{event.payload.errorMessage && <p className="error">{event.payload.errorMessage}</p>}{event.payload.usage && <UsageDetails usage={event.payload.usage} attribution={attribution} endedAt={event.timestamp} />}<MessageActions eventId={event.id} text={contentText(event.payload.content)} fork={false} onCopy={onCopyMessage} /></div></article>;
  if (event.type === "queue.enqueued" && queue !== undefined) return <DeliveryState label={queue.status === "queued" ? queue.priority === "front" ? "Queued next" : "Queued for later" : queue.status === "running" ? "Sending now" : queue.status === "paused" ? "Delivery paused" : queue.status === "completed" ? "Delivered" : queue.status === "aborted" ? "Delivery canceled" : "Delivery failed"} status={queue.status} text={contentText(queue.content)} />;
  if (event.type === "interrupt.requested" && interruption !== undefined) return <DeliveryState label={interruption.status === "queued" ? "Interrupt queued" : interruption.status === "interrupting" ? "Stopping current response" : interruption.status === "delivered" ? "Interrupted and delivered" : "Interrupt delivery failed"} status={interruption.status} text={contentText(interruption.content)} reason={interruption.reason} />;
  if (event.type === "session.error") return <div className="notice error" role="alert">{event.payload.message}</div>;
  if (event.type === "context.compacted") return <div className="notice">Older context was compacted.</div>;
  return null;
}

export function Conversation({ conversation, resolveBlobUrl, searchQuery, onCopyMessage, onForkMessage }: { readonly conversation: ConversationState; readonly resolveBlobUrl?: ((blob: BlobReference) => string | undefined) | undefined; readonly searchQuery?: string | undefined; readonly onCopyMessage?: ((text: string) => void) | undefined; readonly onForkMessage?: ((eventId: EventId) => void) | undefined }): React.JSX.Element {
  const tools = useMemo(() => new Map(conversation.tools.map((tool) => [tool.callEventId, tool])), [conversation.tools]);
  const queue = useMemo(() => new Map(conversation.queue.map((item) => [item.queueItemId, item])), [conversation.queue]);
  const interruptions = useMemo(() => new Map(conversation.interruptDeliveries.map((item) => [item.requestEventId, item])), [conversation.interruptDeliveries]);
  const attributions = useMemo(() => {
    const result = new Map<string, ResponseAttribution>();
    let provider: string | undefined;
    let model: string | undefined;
    let thinking: ThinkingLevel | undefined;
    let startedAt: number | undefined;
    for (const record of conversation.records) {
      if (record.kind !== "event") continue;
      if (record.event.type === "config.provider") provider = record.event.payload.providerId;
      else if (record.event.type === "config.model") model = record.event.payload.modelId;
      else if (record.event.type === "config.thinking") thinking = record.event.payload.effective;
      else if (record.event.type === "model.request_configured") startedAt = record.event.timestamp;
      else if (record.event.type === "assistant.message" && record.event.payload.usage !== undefined) {
        result.set(record.event.id, { ...(provider === undefined ? {} : { provider }), ...(model === undefined ? {} : { model }), ...(thinking === undefined ? {} : { thinking }), ...(startedAt === undefined ? {} : { startedAt }) });
        startedAt = undefined;
      }
    }
    return result;
  }, [conversation.records]);
  return <>{conversation.records.map((record) => {
    if (record.kind !== "event") return null;
    if (record.event.type === "tool.result") return null;
    if (record.event.type === "tool.call") {
      const tool = tools.get(record.event.id);
      return tool === undefined ? null : <ToolEntry key={record.event.id} tool={tool} />;
    }
    return <EventRow key={record.event.id} event={record.event} queue={queue.get(record.event.id)} interruption={interruptions.get(record.event.id)} attribution={attributions.get(record.event.id)} resolveBlobUrl={resolveBlobUrl} searchQuery={searchQuery} onCopyMessage={onCopyMessage} onForkMessage={onForkMessage} />;
  })}</>;
}
