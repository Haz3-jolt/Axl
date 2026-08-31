// SPDX-FileCopyrightText: 2026 Hari Srinivasan
// SPDX-License-Identifier: Apache-2.0

import { randomUUID } from "node:crypto";
import type { Dirent } from "node:fs";
import { mkdir, readdir, realpath, rm, stat } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

import {
  AgentSession,
  type EventLogOptions,
  type ExtensionHost,
  JsonlEventLog,
  type ModelPort,
  SessionTree,
  type StablePrompt,
  type ToolRegistry,
} from "@axl/kernel";
import {
  type CanonicalEvent,
  EVENT_FORMAT_VERSION,
  type EventId,
  type EventPayloadMap,
  type InteractionAction,
  type JsonObject,
  type JsonValue,
  parseEvent,
  parseEventId,
  parseSessionId,
  type SessionForkResult,
  type SessionId,
  type SessionModelSelection,
  type SessionSummary,
  type UserContent,
} from "@axl/protocol";

export class DaemonError extends Error {
  readonly code: string;

  constructor(code: string, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "DaemonError";
    this.code = code;
  }
}

export interface SessionRuntime {
  readonly model: ModelPort;
  readonly tools: ToolRegistry;
  readonly prompt?: StablePrompt;
  readonly system?: string;
  readonly log?: EventLogOptions;
  readonly extensionHost?: ExtensionHost;
  readonly sandbox?: EventPayloadMap["sandbox.configured"];
  readonly configModel?: EventPayloadMap["config.model"];
  readonly configThinking?: EventPayloadMap["config.thinking"];
  readonly configDialect?: EventPayloadMap["config.dialect"];
}

export type SessionRuntimeBoundary = "session_start" | "reload" | "model_switch" | "config_change";

export interface SessionInteractionRequest {
  readonly kind: EventPayloadMap["interaction.requested"]["kind"];
  readonly source: string;
  readonly message: string;
  readonly data?: JsonObject;
}

export interface SessionInteractionResponse {
  readonly action: InteractionAction;
  readonly content?: JsonObject;
}

export type SessionRuntimeFactory = (input: {
  readonly sessionId: SessionId;
  readonly cwd: string;
  readonly boundary: SessionRuntimeBoundary;
  readonly selection: SessionModelSelection;
  readonly interact: (
    request: SessionInteractionRequest,
    signal?: AbortSignal,
  ) => Promise<SessionInteractionResponse>;
}) => SessionRuntime | Promise<SessionRuntime>;

export interface SessionManagerOptions {
  readonly dataDirectory: string;
  readonly runtime: SessionRuntimeFactory;
}

interface ActiveTurn {
  readonly controller: AbortController;
  readonly done: Promise<void>;
  finish(): void;
}

interface PendingInteraction {
  readonly resolve: (response: SessionInteractionResponse) => void;
  readonly reject: (error: Error) => void;
}

interface ManagedSession {
  session: AgentSession;
  readonly cwd: string;
  readonly events: CanonicalEvent[];
  readonly listeners: Set<(event: CanonicalEvent) => void>;
  selection: SessionModelSelection;
  activeTurn?: ActiveTurn;
  rebuilding?: Promise<void>;
  readonly interactions: Map<string, PendingInteraction>;
}

function deferredTurn(): ActiveTurn {
  let resolveDone = (): void => undefined;
  const done = new Promise<void>((resolvePromise) => {
    resolveDone = resolvePromise;
  });
  return { controller: new AbortController(), done, finish: resolveDone };
}

function userMessageText(event: CanonicalEvent): string | undefined {
  if (event.type !== "user.message") return undefined;
  const text = event.payload.content
    .filter((item) => item.type === "text")
    .map((item) => item.text)
    .join("\n")
    .trim();
  return text || undefined;
}

function summarizeSession(events: readonly CanonicalEvent[]): SessionSummary {
  const created = events[0];
  if (created?.type !== "session.created") {
    throw new DaemonError("corrupt_session", "Session has no creation event");
  }
  const messages = events.flatMap((event) => {
    const text = userMessageText(event);
    return text === undefined ? [] : [text];
  });
  const firstUserMessage = messages[0];
  const lastUserMessage = messages.at(-1);
  return {
    sessionId: created.sessionId,
    cwd: created.payload.cwd,
    createdAt: created.timestamp,
    updatedAt: events.at(-1)?.timestamp ?? created.timestamp,
    userMessageCount: messages.length,
    ...(firstUserMessage === undefined ? {} : { firstUserMessage }),
    ...(lastUserMessage === undefined ? {} : { lastUserMessage }),
    ...(created.payload.parentSessionId === undefined
      ? {}
      : { parentSessionId: created.payload.parentSessionId }),
  };
}

/** Owns every live session. Clients never receive a mutable kernel object. */
export class SessionManager {
  private readonly options: SessionManagerOptions;
  private readonly sessions = new Map<SessionId, ManagedSession>();
  private readonly opening = new Map<SessionId, Promise<ManagedSession>>();

  constructor(options: SessionManagerOptions) {
    this.options = { ...options, dataDirectory: resolve(options.dataDirectory) };
  }

  private logPath(sessionId: SessionId): string {
    return join(this.options.dataDirectory, "sessions", `${sessionId}.jsonl`);
  }

  private async buildSession(
    sessionId: SessionId,
    cwd: string,
    events: CanonicalEvent[],
    listeners: Set<(event: CanonicalEvent) => void>,
    boundary: SessionRuntimeBoundary,
    selection: SessionModelSelection,
  ): Promise<AgentSession> {
    const runtime = await this.options.runtime({
      sessionId,
      cwd,
      boundary,
      selection,
      interact: (request, signal) => this.interact(sessionId, request, signal),
    });
    return AgentSession.open(this.logPath(sessionId), sessionId, {
      model: runtime.model,
      tools: runtime.tools,
      cwd,
      ...(runtime.prompt === undefined ? {} : { prompt: runtime.prompt }),
      ...(runtime.system === undefined ? {} : { system: runtime.system }),
      ...(runtime.log === undefined ? {} : { log: runtime.log }),
      ...(runtime.extensionHost === undefined ? {} : { extensionHost: runtime.extensionHost }),
      ...(runtime.sandbox === undefined ? {} : { sandbox: runtime.sandbox }),
      ...(runtime.configModel === undefined ? {} : { configModel: runtime.configModel }),
      ...(runtime.configThinking === undefined ? {} : { configThinking: runtime.configThinking }),
      ...(runtime.configDialect === undefined ? {} : { configDialect: runtime.configDialect }),
      onEvent: (event) => {
        events.push(event);
        for (const listener of listeners) listener(event);
      },
    });
  }

  private async open(
    sessionId: SessionId,
    cwd: string,
    selection: SessionModelSelection,
  ): Promise<ManagedSession> {
    const events: CanonicalEvent[] = [];
    const listeners = new Set<(event: CanonicalEvent) => void>();
    const session = await this.buildSession(
      sessionId,
      cwd,
      events,
      listeners,
      "session_start",
      selection,
    );
    const stored = await session.log.read();
    events.length = 0;
    events.push(...stored.events);
    const managed: ManagedSession = {
      session,
      cwd,
      events,
      listeners,
      selection,
      interactions: new Map(),
    };
    this.sessions.set(sessionId, managed);
    return managed;
  }

  async create(
    cwd: string,
    selection: SessionModelSelection = {},
  ): Promise<{ sessionId: SessionId; events: readonly CanonicalEvent[] }> {
    const canonicalCwd = await realpath(cwd).catch((cause: unknown) => {
      throw new DaemonError("invalid_cwd", `Cannot open working directory ${cwd}`, { cause });
    });
    await mkdir(join(this.options.dataDirectory, "sessions"), { recursive: true, mode: 0o700 });
    const sessionId = parseSessionId(randomUUID(), "sessionId");
    const managed = await this.open(sessionId, canonicalCwd, selection);
    return { sessionId, events: [...managed.events] };
  }

  async list(): Promise<readonly SessionSummary[]> {
    const directory = join(this.options.dataDirectory, "sessions");
    let entries: Dirent[];
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }

    const summaries: SessionSummary[] = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".jsonl")) continue;
      const sessionId = parseSessionId(basename(entry.name, ".jsonl"), "session file name");
      const active = this.sessions.get(sessionId);
      const events =
        active?.events ?? (await JsonlEventLog.open(join(directory, entry.name), sessionId)).events;
      summaries.push(summarizeSession(events));
    }
    return summaries.sort((left, right) => right.updatedAt - left.updatedAt);
  }

  async fork(sessionId: unknown, fromEventId: unknown): Promise<SessionForkResult> {
    const sourceId = parseSessionId(sessionId, "sessionId");
    await this.resume(sourceId);
    const source = this.managed(sourceId);
    if (source.activeTurn || source.rebuilding) {
      throw new DaemonError("operation_active", "An operation owns this session; fork after it");
    }
    const eventId = parseEventId(fromEventId, "fromEventId");
    const event = SessionTree.fromEvents(sourceId, source.events).event(eventId);
    if (event.type !== "user.message") {
      throw new DaemonError("invalid_fork_point", "A fork must start from a user message");
    }
    return this.copySession(sourceId, eventId, false, userMessageText(event));
  }

  async clone(sessionId: unknown): Promise<SessionForkResult> {
    const sourceId = parseSessionId(sessionId, "sessionId");
    await this.resume(sourceId);
    const source = this.managed(sourceId);
    if (source.activeTurn || source.rebuilding) {
      throw new DaemonError("operation_active", "An operation owns this session; clone after it");
    }
    const tip = source.events.at(-1)?.id;
    if (tip === undefined)
      throw new DaemonError("empty_session", "Session has no history to clone");
    return this.copySession(sourceId, tip, true);
  }

  async resume(
    sessionId: unknown,
  ): Promise<{ sessionId: SessionId; events: readonly CanonicalEvent[] }> {
    const parsed = parseSessionId(sessionId, "sessionId");
    const existing = this.sessions.get(parsed);
    if (existing) return { sessionId: parsed, events: [...existing.events] };
    const pending = this.opening.get(parsed);
    if (pending) {
      const managed = await pending;
      return { sessionId: parsed, events: [...managed.events] };
    }

    const opening = this.resumeFromLog(parsed);
    this.opening.set(parsed, opening);
    try {
      const managed = await opening;
      return { sessionId: parsed, events: [...managed.events] };
    } finally {
      this.opening.delete(parsed);
    }
  }

  private async copySession(
    sourceId: SessionId,
    targetId: EventId,
    includeTarget: boolean,
    selectedText?: string,
  ): Promise<SessionForkResult> {
    const source = this.managed(sourceId);
    const tree = SessionTree.fromEvents(sourceId, source.events);
    const lineage = tree.lineage(targetId);
    const copied = includeTarget ? lineage.slice(1) : lineage.slice(1, -1);
    const sessionId = parseSessionId(randomUUID(), "sessionId");
    const path = this.logPath(sessionId);
    const startedAt = Date.now();
    const eventIds = new Map<string, string>();
    const operationIds = new Map<string, string>();
    const sourceRoot = lineage[0];
    if (sourceRoot === undefined || sourceRoot.type !== "session.created") {
      throw new DaemonError("corrupt_session", `Session ${sourceId} has no creation event`);
    }

    try {
      const { log } = await JsonlEventLog.open(path, sessionId);
      const root = await log.append({
        version: EVENT_FORMAT_VERSION,
        id: randomUUID(),
        sessionId,
        parentId: null,
        timestamp: startedAt,
        type: "session.created",
        payload: { cwd: source.cwd, parentSessionId: sourceId },
      });
      eventIds.set(sourceRoot.id, root.id);
      let parentId = root.id;
      for (const [index, event] of copied.entries()) {
        if (event.type === "session.created" || event.type === "session.closed") continue;
        const payload = structuredClone(event.payload) as Record<string, JsonValue>;
        if (event.type === "permission.resolved" && typeof payload.requestId === "string") {
          payload.requestId = eventIds.get(payload.requestId) ?? payload.requestId;
        } else if (event.type === "context.compacted" && Array.isArray(payload.replacedEventIds)) {
          payload.replacedEventIds = payload.replacedEventIds.flatMap((id) => {
            const replacement = typeof id === "string" ? eventIds.get(id) : undefined;
            return replacement === undefined ? [] : [replacement];
          });
        }
        const id = randomUUID();
        const operationId =
          event.operationId === undefined
            ? undefined
            : (operationIds.get(event.operationId) ??
              (() => {
                const created = randomUUID();
                operationIds.set(event.operationId as string, created);
                return created;
              })());
        const clone = parseEvent({
          version: EVENT_FORMAT_VERSION,
          id,
          sessionId,
          ...(operationId === undefined ? {} : { operationId }),
          parentId,
          timestamp: startedAt + index + 1,
          type: event.type,
          payload,
        });
        await log.append(clone);
        eventIds.set(event.id, id);
        parentId = clone.id;
      }
      await log.drain();
      const managed = await this.open(sessionId, source.cwd, source.selection);
      return {
        sessionId,
        events: [...managed.events],
        ...(selectedText === undefined ? {} : { selectedText }),
      };
    } catch (error) {
      await rm(path, { force: true });
      throw error;
    }
  }

  private async resumeFromLog(sessionId: SessionId): Promise<ManagedSession> {
    const path = this.logPath(sessionId);
    try {
      await stat(path);
    } catch (cause) {
      throw new DaemonError("unknown_session", `Session ${sessionId} has no recorded history`, {
        cause,
      });
    }
    const { events } = await JsonlEventLog.open(path, sessionId);
    const created = events[0];
    if (created?.type !== "session.created") {
      throw new DaemonError("corrupt_session", `Session ${sessionId} has no creation event`);
    }
    let modelId: string | undefined;
    let thinkingLevel: SessionModelSelection["thinkingLevel"];
    for (const event of events) {
      if (event.type === "config.model") modelId = event.payload.modelId;
      else if (event.type === "config.thinking") thinkingLevel = event.payload.requested;
    }
    return this.open(sessionId, created.payload.cwd, {
      ...(modelId === undefined ? {} : { modelId }),
      ...(thinkingLevel === undefined ? {} : { thinkingLevel }),
    });
  }

  async reload(sessionId: unknown): Promise<{ events: readonly CanonicalEvent[] }> {
    const managed = this.managed(sessionId);
    if (managed.activeTurn || managed.rebuilding) {
      throw new DaemonError("operation_active", "An operation owns this branch; reload after it");
    }
    const before = managed.events.length;
    await this.rebuild(managed, "reload", managed.selection);
    return { events: managed.events.slice(before) };
  }

  async configure(
    sessionId: unknown,
    update: SessionModelSelection,
  ): Promise<{ events: readonly CanonicalEvent[] }> {
    const managed = this.managed(sessionId);
    if (managed.activeTurn || managed.rebuilding) {
      throw new DaemonError(
        "operation_active",
        "An operation owns this branch; change configuration after it",
      );
    }
    const selection = { ...managed.selection, ...update };
    const boundary: SessionRuntimeBoundary =
      update.modelId !== undefined && update.modelId !== managed.selection.modelId
        ? "model_switch"
        : "config_change";
    const before = managed.events.length;
    await this.rebuild(managed, boundary, selection);
    managed.selection = selection;
    return { events: managed.events.slice(before) };
  }

  async send(sessionId: unknown, content: readonly UserContent[]): Promise<{ stopReason: string }> {
    const managed = this.managed(sessionId);
    if (managed.activeTurn || managed.rebuilding) {
      throw new DaemonError("operation_active", "An operation already owns this branch");
    }
    const active = deferredTurn();
    managed.activeTurn = active;
    try {
      const result = await managed.session.runTurn(content, active.controller.signal);
      return { stopReason: result.stopReason };
    } finally {
      if (managed.activeTurn === active) delete managed.activeTurn;
      active.finish();
    }
  }

  interrupt(sessionId: unknown): { interrupted: boolean } {
    const active = this.managed(sessionId).activeTurn;
    if (!active) return { interrupted: false };
    active.controller.abort();
    return { interrupted: true };
  }

  subscribe(
    sessionId: unknown,
    listener: (event: CanonicalEvent) => void,
    afterEventId?: EventId,
  ): { snapshot: readonly CanonicalEvent[]; unsubscribe: () => void } {
    const managed = this.managed(sessionId);
    let snapshot = [...managed.events];
    if (afterEventId !== undefined) {
      const index = snapshot.findIndex((event) => event.id === afterEventId);
      if (index < 0)
        throw new DaemonError("unknown_cursor", `Event ${afterEventId} is not in this session`);
      snapshot = snapshot.slice(index + 1);
    }
    managed.listeners.add(listener);
    return { snapshot, unsubscribe: () => managed.listeners.delete(listener) };
  }

  private async interact(
    sessionId: SessionId,
    request: SessionInteractionRequest,
    signal?: AbortSignal,
  ): Promise<SessionInteractionResponse> {
    if (signal?.aborted) throw new DOMException("Interaction aborted", "AbortError");
    const managed = this.managed(sessionId);
    const interactionId = randomUUID();
    let pending!: PendingInteraction;
    const response = new Promise<SessionInteractionResponse>((resolvePromise, rejectPromise) => {
      pending = { resolve: resolvePromise, reject: rejectPromise };
    });
    managed.interactions.set(interactionId, pending);

    const abort = (): void => {
      if (managed.interactions.delete(interactionId)) {
        pending.reject(new DOMException("Interaction aborted", "AbortError"));
      }
    };
    signal?.addEventListener("abort", abort, { once: true });
    const timeout = setTimeout(() => {
      if (managed.interactions.delete(interactionId)) {
        pending.reject(new DaemonError("interaction_timeout", "Interaction timed out"));
      }
    }, 300_000);
    timeout.unref();

    try {
      await managed.session.requestInteraction({ interactionId, ...request });
      return await response;
    } catch (error) {
      managed.interactions.delete(interactionId);
      throw error;
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
    }
  }

  async respondToInteraction(
    sessionId: unknown,
    interactionId: string,
    response: SessionInteractionResponse,
  ): Promise<void> {
    const managed = this.managed(sessionId);
    const pending = managed.interactions.get(interactionId);
    if (!pending) {
      throw new DaemonError("unknown_interaction", `Interaction ${interactionId} is not pending`);
    }
    managed.interactions.delete(interactionId);
    try {
      await managed.session.resolveInteraction({ interactionId, ...response });
      pending.resolve(response);
    } catch (error) {
      pending.reject(error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  private async rebuild(
    managed: ManagedSession,
    boundary: SessionRuntimeBoundary,
    selection: SessionModelSelection,
  ): Promise<void> {
    const previous = managed.session;
    const rebuilding = (async () => {
      const next = await this.buildSession(
        previous.log.sessionId,
        managed.cwd,
        managed.events,
        managed.listeners,
        boundary,
        selection,
      );
      await previous.dispose();
      managed.session = next;
    })();
    managed.rebuilding = rebuilding;
    try {
      await rebuilding;
    } finally {
      if (managed.rebuilding === rebuilding) delete managed.rebuilding;
    }
  }

  async dispose(sessionId: unknown): Promise<void> {
    const parsed = parseSessionId(sessionId, "sessionId");
    const managed = this.sessions.get(parsed);
    if (!managed) return;
    await managed.rebuilding;
    managed.activeTurn?.controller.abort();
    for (const [interactionId, interaction] of managed.interactions) {
      managed.interactions.delete(interactionId);
      interaction.reject(new DaemonError("session_disposed", "Session was disposed"));
    }
    await managed.activeTurn?.done;
    this.sessions.delete(parsed);
    await managed.session.dispose();
  }

  async disposeAll(): Promise<void> {
    await Promise.all([...this.sessions.keys()].map((sessionId) => this.dispose(sessionId)));
  }

  private managed(sessionId: unknown): ManagedSession {
    const parsed = parseSessionId(sessionId, "sessionId");
    const managed = this.sessions.get(parsed);
    if (!managed)
      throw new DaemonError("unknown_session", `Session ${parsed} is not open; resume it first`);
    return managed;
  }
}
