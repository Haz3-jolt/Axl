// SPDX-FileCopyrightText: 2026 Hari Srinivasan
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  type AxlClient,
  type ConnectionState,
  type ConversationState,
  type EventId,
  type SessionId,
  type SessionOpenResult,
  type SessionSubscription,
  type SessionSummary,
  type ThinkingLevel,
  type WorkspaceDiffResult,
  type WorkspaceStatusResult,
  subscribeSession,
} from "@axl/sdk";

import { Conversation } from "@axl/ui/react";
import {
  connectWebEnvironment,
  parseWebPreferences,
  saveWebPreferences,
  type WebBootstrap,
  type WebPreferences,
} from "./environment.ts";
import { loadModelCatalog, type ModelChoice } from "./model-catalog.ts";
import { ModelPicker } from "./model-picker.tsx";
import {
  matchesSession,
  restoreDraft,
  sessionTitle,
  sessionUsageStats,
  transcriptMessageMatches,
  transcriptPromptBreakpoints,
} from "./view-state.ts";
import { WorkspaceChanges, type WorkspaceReview } from "./workspace-changes.tsx";

const DEFAULT_LAYOUT: WebPreferences = {
  sidebarWidth: 264,
  changesWidth: 680,
  sidebarCollapsed: false,
  changesView: "files",
};
const PREVIEW_LAYOUT_KEY = "axl.preview.layout";

function compactNumber(value: number): string {
  return value >= 1000 ? `${(value / 1000).toFixed(value >= 10_000 ? 0 : 1)}k` : String(value);
}

function previewLayout(): WebPreferences {
  try {
    return parseWebPreferences(JSON.parse(localStorage.getItem(PREVIEW_LAYOUT_KEY) ?? "null"));
  } catch {
    return DEFAULT_LAYOUT;
  }
}

const EMPTY_STATE: ConversationState = {
  records: [], tools: [], interactions: [], operations: [], uncertainShellOperations: [], queue: [], interruptDeliveries: [],
  usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0, costUsd: 0 },
  closed: false,
};

export interface WebPreview {
  readonly sessions: readonly SessionSummary[];
  readonly opened: SessionOpenResult;
  readonly conversation: ConversationState;
  readonly modelCatalog?: readonly ModelChoice[];
  readonly resolveBlobUrl?: (sha256: string) => string | undefined;
  readonly workspace?: WorkspaceReview;
}

export function AxlApp({ preview }: { readonly preview?: WebPreview } = {}): React.JSX.Element {
  const initialLayout = useRef(preview === undefined ? DEFAULT_LAYOUT : previewLayout()).current;
  const [client, setClient] = useState<AxlClient>();
  const [bootstrap, setBootstrap] = useState<WebBootstrap>();
  const [sessions, setSessions] = useState<readonly SessionSummary[]>(preview?.sessions ?? []);
  const [opened, setOpened] = useState<SessionOpenResult | undefined>(preview?.opened);
  const [conversation, setConversation] = useState<ConversationState>(preview?.conversation ?? EMPTY_STATE);
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(initialLayout.sidebarCollapsed);
  const [sidebarWidth, setSidebarWidth] = useState(initialLayout.sidebarWidth);
  const [changesWidth, setChangesWidth] = useState(initialLayout.changesWidth);
  const [changesView, setChangesView] = useState<"files" | "all">(initialLayout.changesView);
  const [changesOpen, setChangesOpen] = useState(false);
  const [transcriptSearchOpen, setTranscriptSearchOpen] = useState(false);
  const [usageOpen, setUsageOpen] = useState(false);
  const [transcriptQuery, setTranscriptQuery] = useState("");
  const [transcriptMatch, setTranscriptMatch] = useState(-1);
  const [transcriptNavigationVisible, setTranscriptNavigationVisible] = useState(false);
  const [activePromptId, setActivePromptId] = useState<string>();
  const [modelCatalog, setModelCatalog] = useState<readonly ModelChoice[]>(preview?.modelCatalog ?? []);
  const [workspaceReview, setWorkspaceReview] = useState<WorkspaceReview | undefined>(preview?.workspace);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [workspaceError, setWorkspaceError] = useState<string>();
  const [workspaceAvailable, setWorkspaceAvailable] = useState(preview?.workspace !== undefined);
  const [connection, setConnection] = useState<ConnectionState>(preview ? "connected" : "connecting");
  const [error, setError] = useState<string>();
  const [actionNotice, setActionNotice] = useState<string>();
  const subscription = useRef<SessionSubscription | undefined>(undefined);
  const selectionGeneration = useRef(0);
  const workspaceGeneration = useRef(0);
  const transcript = useRef<HTMLDivElement>(null);
  const transcriptNavigationTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const actionNoticeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const refreshSessions = async (current: AxlClient): Promise<readonly SessionSummary[]> => {
    const result = await current.request("session.list", { scope: "all_local", order: "recent", pageSize: 100 });
    setSessions(result.sessions);
    return result.sessions;
  };

  const openSession = async (current: AxlClient, sessionId: SessionId): Promise<void> => {
    const generation = ++selectionGeneration.current;
    workspaceGeneration.current += 1;
    setBusy(true); setError(undefined); setSidebarOpen(false); setChangesOpen(false); setTranscriptSearchOpen(false); setUsageOpen(false); setTranscriptQuery(""); setActivePromptId(undefined); setWorkspaceReview(undefined); setWorkspaceError(undefined); setOpened(undefined); setConversation(EMPTY_STATE);
    const previous = subscription.current;
    subscription.current = undefined;
    try {
      await previous?.close();
      if (generation !== selectionGeneration.current) return;
      const next = await current.request("session.resume", { sessionId });
      if (generation !== selectionGeneration.current) return;
      let live = false;
      const nextSubscription = await subscribeSession(current, next.sessionId, {
        onEvent: (event) => {
          if (live && event.type === "config.dialect" && event.payload.reason === "reload") {
            void loadModelCatalog(current, true).then((catalog) => {
              if (generation === selectionGeneration.current) setModelCatalog(catalog);
            }).catch((cause: unknown) => {
              if (generation === selectionGeneration.current)
                setError(cause instanceof Error ? cause.message : "Could not refresh models");
            });
          }
        },
        onChange: (projector) => {
          if (generation === selectionGeneration.current) setConversation(projector.state);
        },
        onResyncRequired: (cause) => {
          if (generation === selectionGeneration.current) setError(cause.message);
        },
      });
      live = true;
      if (generation !== selectionGeneration.current) {
        await nextSubscription.close();
        return;
      }
      subscription.current = nextSubscription;
      setOpened(next);
    } catch (cause) {
      if (generation === selectionGeneration.current)
        setError(cause instanceof Error ? cause.message : "Could not open the session");
    } finally {
      if (generation === selectionGeneration.current) setBusy(false);
    }
  };

  useEffect(() => {
    if (preview !== undefined) return;
    let disposed = false;
    let activeClient: AxlClient | undefined;
    let removeStateListener = (): void => undefined;
    void connectWebEnvironment().then(async (environment) => {
      if (disposed) { environment.client.close(); return; }
      activeClient = environment.client; setClient(environment.client); setBootstrap(environment.bootstrap);
      setSidebarWidth(environment.bootstrap.preferences.sidebarWidth);
      setChangesWidth(environment.bootstrap.preferences.changesWidth);
      setChangesView(environment.bootstrap.preferences.changesView);
      setSidebarCollapsed(environment.bootstrap.preferences.sidebarCollapsed);
      setWorkspaceAvailable(
        environment.client.connection.grantedCapabilities.includes("session.workspace.status") &&
          environment.client.connection.grantedCapabilities.includes("session.workspace.diff"),
      );
      if (environment.client.connection.grantedCapabilities.includes("provider.list")) {
        void loadModelCatalog(environment.client).then((catalog) => {
          if (!disposed) setModelCatalog(catalog);
        }).catch((cause: unknown) => {
          if (!disposed) setError(cause instanceof Error ? cause.message : "Could not load models");
        });
      }
      removeStateListener = environment.client.onStateChange((state) => {
        if (!disposed) setConnection(state);
      });
      await refreshSessions(environment.client);
      if (disposed) return;
      if (environment.selectedSessionId !== undefined) {
        await openSession(environment.client, environment.selectedSessionId);
      } else {
        const created = await environment.client.request("session.create", {
          cwd: environment.bootstrap.cwd,
          profile: "standard",
        });
        if (disposed) return;
        await refreshSessions(environment.client);
        if (!disposed) await openSession(environment.client, created.sessionId);
      }
    }).catch((cause: unknown) => {
      if (!disposed) {
        setConnection("disconnected");
        setError(cause instanceof Error ? cause.message : "Could not start Axl web");
      }
    });
    return () => {
      disposed = true;
      selectionGeneration.current += 1;
      workspaceGeneration.current += 1;
      removeStateListener();
      subscription.current?.detach();
      activeClient?.close();
    };
  }, [preview]);

  useEffect(() => { transcript.current?.scrollTo({ top: transcript.current.scrollHeight }); }, [conversation.records.length, conversation.activity?.sequence]);
  useEffect(() => setTranscriptMatch(-1), [transcriptQuery]);
  useEffect(() => {
    const keydown = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === "f" && opened !== undefined) {
        event.preventDefault();
        setTranscriptSearchOpen(true);
      } else if (event.key === "Escape") {
        setTranscriptSearchOpen(false);
      }
    };
    addEventListener("keydown", keydown);
    return () => {
      removeEventListener("keydown", keydown);
      if (transcriptNavigationTimer.current !== undefined) clearTimeout(transcriptNavigationTimer.current);
      if (actionNoticeTimer.current !== undefined) clearTimeout(actionNoticeTimer.current);
    };
  }, [opened]);

  const createSession = async (): Promise<void> => {
    if (!client || !bootstrap) return;
    setBusy(true); setError(undefined);
    try {
      const created = await client.request("session.create", { cwd: bootstrap.cwd, profile: "standard" });
      await refreshSessions(client); await openSession(client, created.sessionId);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not create a session"); setBusy(false); }
  };

  const send = async (): Promise<void> => {
    const text = draft.trim(); if (!client || !opened || !text || busy) return;
    setDraft(""); setBusy(true); setError(undefined);
    try { await client.request("session.send", { sessionId: opened.sessionId, content: [{ type: "text", text }], delivery: "prompt" }); await refreshSessions(client); }
    catch (cause) { setDraft((current) => restoreDraft(text, current)); setError(cause instanceof Error ? cause.message : "Message was not sent"); }
    finally { setBusy(false); }
  };

  const configureModel = async (choice: ModelChoice): Promise<void> => {
    if (preview !== undefined) {
      setConversation((current) => ({ ...current, provider: choice.providerId, model: choice.modelId }));
      return;
    }
    if (!client || !opened) return;
    setBusy(true); setError(undefined);
    try {
      await client.request("session.configure", { sessionId: opened.sessionId, providerId: choice.providerId, modelId: choice.modelId });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not change model");
    } finally {
      setBusy(false);
    }
  };

  const configureThinking = async (thinkingLevel: ThinkingLevel): Promise<void> => {
    if (preview !== undefined) {
      setConversation((current) => ({ ...current, thinking: thinkingLevel }));
      return;
    }
    if (!client || !opened) return;
    setBusy(true); setError(undefined);
    try {
      await client.request("session.configure", { sessionId: opened.sessionId, thinkingLevel });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not change effort");
    } finally {
      setBusy(false);
    }
  };

  const showActionNotice = (message: string): void => {
    setActionNotice(message);
    if (actionNoticeTimer.current !== undefined) clearTimeout(actionNoticeTimer.current);
    actionNoticeTimer.current = setTimeout(() => setActionNotice(undefined), 1800);
  };

  const copyMessage = async (text: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text);
      showActionNotice("Message copied");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not copy message");
    }
  };

  const forkMessage = async (fromEventId: EventId): Promise<void> => {
    if (conversation.activeOperationId !== undefined) {
      setError("Finish or interrupt the current response before forking");
      return;
    }
    if (preview !== undefined) {
      showActionNotice("Fork preview");
      return;
    }
    if (!client || !opened) return;
    setBusy(true); setError(undefined);
    try {
      const forked = await client.request("session.fork", { sessionId: opened.sessionId, fromEventId });
      await refreshSessions(client);
      await openSession(client, forked.sessionId);
      setDraft(forked.selectedText ?? "");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not fork the session");
      setBusy(false);
    }
  };

  const reconnect = async (): Promise<void> => {
    if (!client) return;
    setError(undefined);
    try {
      await client.reconnect();
      await refreshSessions(client);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not reconnect to the daemon");
    }
  };

  const interrupt = async (): Promise<void> => {
    if (!client || !opened) return;
    try { await client.request("session.interrupt", { sessionId: opened.sessionId }); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not interrupt the session"); }
  };

  const loadWorkspaceChanges = async (): Promise<void> => {
    if (preview?.workspace !== undefined) {
      setWorkspaceReview(preview.workspace);
      return;
    }
    if (!client || !opened) return;
    const generation = ++workspaceGeneration.current;
    setWorkspaceLoading(true); setWorkspaceError(undefined);
    try {
      const status: WorkspaceStatusResult = await client.request("session.workspace.status", {
        sessionId: opened.sessionId,
        scope: "working",
      });
      const diffs: WorkspaceDiffResult[] = [];
      for (const entry of status.entries.slice(0, 100)) {
        diffs.push(await client.request("session.workspace.diff", {
          sessionId: opened.sessionId,
          entryId: entry.entryId,
          contextLines: 3,
          repositoryGeneration: status.repositoryGeneration,
          maxBytes: 512 * 1024,
        }));
        if (generation !== workspaceGeneration.current) return;
      }
      setWorkspaceReview({ status, diffs, ...(status.entries.length > 100 ? { truncated: true } : {}) });
    } catch (cause) {
      if (generation === workspaceGeneration.current)
        setWorkspaceError(cause instanceof Error ? cause.message : "Could not load workspace changes");
    } finally {
      if (generation === workspaceGeneration.current) setWorkspaceLoading(false);
    }
  };

  const toggleChanges = (): void => {
    if (changesOpen) {
      setChangesOpen(false);
      return;
    }
    setChangesOpen(true);
    if (workspaceReview === undefined) void loadWorkspaceChanges();
  };

  const persistLayout = (preferences: WebPreferences): void => {
    if (preview !== undefined) {
      localStorage.setItem(PREVIEW_LAYOUT_KEY, JSON.stringify(preferences));
      return;
    }
    void saveWebPreferences(preferences).catch((cause: unknown) =>
      setError(cause instanceof Error ? cause.message : "Could not save layout"),
    );
  };

  const toggleSidebar = (): void => {
    if (matchMedia("(max-width: 760px)").matches) {
      setSidebarOpen(false);
      return;
    }
    const collapsed = !sidebarCollapsed;
    setSidebarCollapsed(collapsed);
    persistLayout({ sidebarWidth, changesWidth, sidebarCollapsed: collapsed, changesView });
  };

  const resizePanelBy = (side: "left" | "right", delta: number): void => {
    const next = side === "left"
      ? Math.max(200, Math.min(420, sidebarWidth + delta, window.innerWidth - changesWidth - 520))
      : Math.max(420, Math.min(900, changesWidth + delta, window.innerWidth - sidebarWidth - 520));
    if (side === "left") setSidebarWidth(next);
    else setChangesWidth(next);
    persistLayout({
      sidebarWidth: side === "left" ? next : sidebarWidth,
      changesWidth: side === "right" ? next : changesWidth,
      sidebarCollapsed,
      changesView,
    });
  };

  const resizePanel = (side: "left" | "right", start: React.PointerEvent): void => {
    start.preventDefault();
    let next = side === "left" ? sidebarWidth : changesWidth;
    document.body.classList.add("resizing-panels");
    const move = (event: PointerEvent): void => {
      next = side === "left"
        ? Math.max(200, Math.min(420, event.clientX, window.innerWidth - changesWidth - 520))
        : Math.max(420, Math.min(900, window.innerWidth - event.clientX, window.innerWidth - sidebarWidth - 520));
      if (side === "left") setSidebarWidth(next);
      else setChangesWidth(next);
    };
    const stop = (): void => {
      removeEventListener("pointermove", move);
      removeEventListener("pointerup", stop);
      document.body.classList.remove("resizing-panels");
      persistLayout({
        sidebarWidth: side === "left" ? next : sidebarWidth,
        changesWidth: side === "right" ? next : changesWidth,
        sidebarCollapsed,
        changesView,
      });
    };
    addEventListener("pointermove", move);
    addEventListener("pointerup", stop, { once: true });
  };

  const selectedSummary = sessions.find((item) => item.sessionId === opened?.sessionId);
  const currentTitle = selectedSummary === undefined ? "Current session" : sessionTitle(selectedSummary);
  const visibleSessions = sessions.filter((session) => matchesSession(session, query));
  const promptBreakpoints = useMemo(() => transcriptPromptBreakpoints(conversation), [conversation]);
  const transcriptMatches = useMemo(() => transcriptMessageMatches(conversation, transcriptQuery), [conversation, transcriptQuery]);
  const usageStats = useMemo(() => sessionUsageStats(conversation), [conversation]);
  const connected = connection === "connected";
  const canConfigure = preview !== undefined || client?.connection.grantedCapabilities.includes("session.configure") === true;

  const jumpToMessage = (id: string): void => {
    document.getElementById(`message-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    setActivePromptId(id);
  };

  const moveTranscriptMatch = (direction: -1 | 1): void => {
    if (transcriptMatches.length === 0) return;
    const current = transcriptMatch < 0 ? (direction === 1 ? -1 : 0) : transcriptMatch;
    const next = (current + direction + transcriptMatches.length) % transcriptMatches.length;
    setTranscriptMatch(next);
    const id = transcriptMatches[next];
    if (id !== undefined) jumpToMessage(id);
  };

  const trackTranscriptScroll = (): void => {
    const viewport = transcript.current;
    if (viewport === null) return;
    setTranscriptNavigationVisible(true);
    if (transcriptNavigationTimer.current !== undefined) clearTimeout(transcriptNavigationTimer.current);
    transcriptNavigationTimer.current = setTimeout(() => setTranscriptNavigationVisible(false), 1400);
    const threshold = viewport.getBoundingClientRect().top + 120;
    let active = promptBreakpoints[0]?.id;
    for (const point of promptBreakpoints) {
      const element = document.getElementById(`message-${point.id}`);
      if (element !== null && element.getBoundingClientRect().top <= threshold) active = point.id;
    }
    setActivePromptId(active);
  };

  return <main className={`shell${sidebarCollapsed ? " sidebar-collapsed" : ""}${changesOpen ? " changes-open" : ""}`} style={{ "--sidebar-width": `${sidebarWidth}px`, "--changes-width": `${changesWidth}px` } as CSSProperties}>
    <button className="mobile-menu" aria-label="Open sessions" onClick={() => setSidebarOpen(true)}><span></span><span></span><span></span></button>
    {sidebarOpen && <button className="scrim" aria-label="Close sessions" onClick={() => setSidebarOpen(false)} />}
    <aside className={sidebarOpen ? "sidebar open" : "sidebar"} aria-label="Sessions">
      <div className="brand"><span className="brand-mark">◆</span><strong>Axl</strong><button className="sidebar-toggle" aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"} onClick={toggleSidebar}><svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="2.5" width="12" height="11" rx="1.5" /><path d="M6 2.5v11m4.5-8L8 8l2.5 2.5" /></svg></button></div>
      <div className="workspace-actions"><span>Workspace</span><button aria-label="New session" onClick={() => void createSession()}>＋</button></div>
      <label className="search"><span aria-hidden="true">⌕</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Search sessions" placeholder="Search sessions" /></label>
      <nav>{visibleSessions.map((session) => <button key={session.sessionId} aria-label={`${sessionTitle(session)}, ${session.runtime.state}`} className={session.sessionId === opened?.sessionId ? "session active" : "session"} onClick={() => client && void openSession(client, session.sessionId)}><span className={`session-icon ${session.runtime.state}`} aria-hidden="true"><svg viewBox="0 0 16 16"><path d="M3 3.5h10v7H7l-3 2v-2H3z" /></svg></span><span><strong>{sessionTitle(session)}</strong><small>{session.cwd}</small></span></button>)}{visibleSessions.length === 0 && <p className="no-sessions">No matching sessions</p>}</nav>
      <div className="daemon"><span className="daemon-status" aria-hidden="true"></span><span><strong>Local daemon</strong><small>{opened?.runtime.state ?? "Ready"} · {connection}</small></span></div>
      {!sidebarCollapsed && <div className="panel-resizer left" role="separator" aria-orientation="vertical" aria-label="Resize session sidebar" aria-valuemin={200} aria-valuemax={420} aria-valuenow={sidebarWidth} tabIndex={0} onPointerDown={(event) => resizePanel("left", event)} onKeyDown={(event) => { if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); resizePanelBy("left", event.key === "ArrowLeft" ? -16 : 16); } }} />}
    </aside>
    <section className="workspace">
      <header className="topbar"><div><span className="crumb">Sessions</span><span className="separator">›</span><strong>{opened ? currentTitle : "Select a session"}</strong></div><div className="top-actions">{opened && <button className={usageOpen ? "usage-toggle active" : "usage-toggle"} aria-label="Show session usage" aria-expanded={usageOpen} onClick={() => setUsageOpen((open) => !open)}><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 12V8M8 12V4M13 12V6" /></svg><span>Usage</span></button>}{opened && <button className={transcriptSearchOpen ? "transcript-search-toggle active" : "transcript-search-toggle"} aria-label="Search transcript" aria-expanded={transcriptSearchOpen} onClick={() => setTranscriptSearchOpen((open) => !open)}><svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4.25" /><path d="m10.25 10.25 3 3" /></svg></button>}{workspaceAvailable && opened && <button className={changesOpen ? "changes-toggle active" : "changes-toggle"} onClick={toggleChanges} aria-expanded={changesOpen}><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 3.5h10M3 8h10M3 12.5h10M5 2v3M11 6.5v3M7 11v3" /></svg><span>Changes</span>{workspaceReview && <b>{workspaceReview.status.entries.length}</b>}</button>}</div></header>
      {usageOpen && <section className="session-usage" aria-label="Session usage"><header><strong>Session usage</strong><button type="button" aria-label="Close session usage" onClick={() => setUsageOpen(false)}>×</button></header><p>{conversation.provider && conversation.model ? `${conversation.provider} / ${conversation.model}` : conversation.model ?? "No model selected"}{conversation.thinking ? ` · ${conversation.thinking}` : ""}</p><dl><div><dt>Input</dt><dd>{compactNumber(conversation.usage.inputTokens)}</dd></div><div><dt>Output</dt><dd>{compactNumber(conversation.usage.outputTokens)}</dd></div><div><dt>Cache read</dt><dd>{compactNumber(conversation.usage.cacheReadTokens)}</dd></div><div><dt>Cache hit</dt><dd>{usageStats.cacheHitPercent.toFixed(1)}%</dd></div><div><dt>Reasoning</dt><dd>{compactNumber(conversation.usage.reasoningTokens)}</dd></div><div><dt>Throughput</dt><dd>{usageStats.tokensPerSecond === undefined ? "Unknown" : `${usageStats.tokensPerSecond.toFixed(1)} tok/s`}</dd></div><div><dt>Recorded cost</dt><dd>${conversation.usage.costUsd.toFixed(4)}</dd></div></dl>{usageStats.unknownCostResponses > 0 && <small>{usageStats.unknownCostResponses} response{usageStats.unknownCostResponses === 1 ? " has" : "s have"} no cost data.</small>}</section>}
      {transcriptSearchOpen && <div className="transcript-search" role="search"><svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4.25" /><path d="m10.25 10.25 3 3" /></svg><input autoFocus type="search" aria-label="Search transcript" placeholder="Search transcript" value={transcriptQuery} onChange={(event) => setTranscriptQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); moveTranscriptMatch(event.shiftKey ? -1 : 1); } }} /><span>{transcriptQuery.trim() ? `${transcriptMatches.length === 0 ? 0 : Math.max(0, transcriptMatch + 1)} / ${transcriptMatches.length}` : ""}</span><button type="button" aria-label="Previous result" disabled={transcriptMatches.length === 0} onClick={() => moveTranscriptMatch(-1)}><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 10 4-4 4 4" /></svg></button><button type="button" aria-label="Next result" disabled={transcriptMatches.length === 0} onClick={() => moveTranscriptMatch(1)}><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg></button><button type="button" aria-label="Close transcript search" onClick={() => { setTranscriptSearchOpen(false); setTranscriptQuery(""); }}><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8" /></svg></button></div>}
      <div className="thread" ref={transcript} onScroll={trackTranscriptScroll}>
        {opened ? <div className="thread-inner"><div className="thread-title"><h1>{currentTitle}</h1><p>{opened.cwd}</p></div><Conversation conversation={conversation} searchQuery={transcriptQuery} resolveBlobUrl={preview?.resolveBlobUrl === undefined ? undefined : (blob) => preview.resolveBlobUrl?.(blob.sha256)} onCopyMessage={(text) => void copyMessage(text)} onForkMessage={preview !== undefined || client?.connection.grantedCapabilities.includes("session.fork") === true ? (eventId) => void forkMessage(eventId) : undefined} />{conversation.activity && <article className="message assistant live"><span className="avatar axl">◆</span><div><header><strong>Axl</strong><time>working</time></header>{conversation.activity.thinking && <details><summary>Thinking</summary><p>{conversation.activity.thinking}</p></details>}<p className="waiting-response">{conversation.activity.text || "Waiting for response"}<span className="waiting-dots" aria-hidden="true"><i></i><i></i><i></i></span></p></div></article>}</div> : <div className="empty"><span className="brand-mark large">◆</span><h1>No session selected</h1><p>Resume a durable session or start one in this workspace.</p><button onClick={() => void createSession()}>New session</button></div>}
      </div>
      {promptBreakpoints.length > 1 && <nav className={`prompt-breakpoints${transcriptNavigationVisible || transcriptSearchOpen ? " visible" : ""}`} aria-label="Conversation prompts" onMouseEnter={() => { if (transcriptNavigationTimer.current !== undefined) clearTimeout(transcriptNavigationTimer.current); setTranscriptNavigationVisible(true); }} onMouseLeave={() => setTranscriptNavigationVisible(false)}>{promptBreakpoints.map((point) => <button type="button" key={point.id} className={point.id === activePromptId ? "active" : ""} title={point.text} onClick={() => jumpToMessage(point.id)}><span>{point.text}</span></button>)}</nav>}
      {!connected && <div className="connection-banner" role="status" aria-live="polite"><span>{connection === "disconnected" ? "Connection to the daemon was lost." : connection === "incompatible" ? "The browser and daemon versions are incompatible." : "Connecting to the daemon…"}</span>{connection === "disconnected" && client !== undefined && <button onClick={() => void reconnect()}>Reconnect</button>}</div>}
      {actionNotice && <div className="action-notice" role="status">{actionNotice}</div>}
      {error && <div className="error-banner" role="alert"><span>{error}</span><button aria-label="Dismiss error" onClick={() => setError(undefined)}>×</button></div>}
      {opened && <form className="composer" onSubmit={(event) => { event.preventDefault(); void send(); }}><textarea value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); } }} placeholder="Ask Axl…" aria-label="Message" rows={3} disabled={busy} /><div className="composer-footer"><ModelPicker choices={modelCatalog} provider={conversation.provider} model={conversation.model} thinking={conversation.thinking} disabled={!canConfigure || busy || (preview === undefined && conversation.activeOperationId !== undefined) || !connected} onModel={(choice) => void configureModel(choice)} onThinking={(level) => void configureThinking(level)} />{conversation.activeOperationId ? <button type="button" className="composer-submit stop" aria-label="Stop response" onClick={() => void interrupt()} disabled={!connected}><svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3.75" y="3.75" width="8.5" height="8.5" rx="1.25" /></svg></button> : <button className="composer-submit" aria-label="Send message" disabled={!draft.trim() || busy || !connected}><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M14 2 8.5 14 6.4 9.6 2 7.5 14 2Z M6.4 9.6 10 6" /></svg></button>}</div></form>}
    </section>
    {changesOpen && <><div className="panel-resizer right" role="separator" aria-orientation="vertical" aria-label="Resize changes panel" aria-valuemin={420} aria-valuemax={900} aria-valuenow={changesWidth} tabIndex={0} onPointerDown={(event) => resizePanel("right", event)} onKeyDown={(event) => { if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); resizePanelBy("right", event.key === "ArrowLeft" ? 16 : -16); } }} /><WorkspaceChanges review={workspaceReview} loading={workspaceLoading} error={workspaceError} view={changesView} onViewChange={(view) => { setChangesView(view); persistLayout({ sidebarWidth, changesWidth, sidebarCollapsed, changesView: view }); }} onClose={() => setChangesOpen(false)} onRetry={() => void loadWorkspaceChanges()} /></>}
  </main>;
}
