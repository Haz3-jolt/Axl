// SPDX-FileCopyrightText: 2026 Hari Srinivasan
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useRef, useState } from "react";
import {
  type AxlClient,
  type CanonicalEvent,
  type ConversationState,
  type SessionId,
  type SessionOpenResult,
  type SessionSubscription,
  type SessionSummary,
  subscribeSession,
} from "@axl/sdk";

import { connectWebEnvironment, type WebBootstrap } from "./environment.ts";

const EMPTY_STATE: ConversationState = {
  records: [], tools: [], interactions: [], operations: [], uncertainShellOperations: [], queue: [], interruptDeliveries: [],
  usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0, costUsd: 0 },
  closed: false,
};

export function contentText(content: readonly { readonly type: string; readonly text?: string }[]): string {
  return content.filter((item) => item.type === "text").map((item) => item.text ?? "").join("");
}

function EventRow({ event }: { readonly event: CanonicalEvent }): React.JSX.Element | null {
  if (event.type === "user.message") return <article className="message user"><span className="avatar">Y</span><div><header><strong>You</strong><time>{new Date(event.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time></header><p>{contentText(event.payload.content)}</p></div></article>;
  if (event.type === "assistant.message") return <article className="message assistant"><span className="avatar axl">◆</span><div><header><strong>Axl</strong><time>{new Date(event.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time></header>{event.payload.content.map((item, index) => item.type === "thinking" ? <details key={index}><summary>Thinking</summary><p>{item.text}</p></details> : item.type === "text" ? <p key={index}>{item.text}</p> : null)}{event.payload.stopReason === "length" && <p className="warning">Response stopped at the model output limit.</p>}{event.payload.errorMessage && <p className="error">{event.payload.errorMessage}</p>}</div></article>;
  if (event.type === "tool.call") return <div className="tool-row"><span className="tool-state">⌁</span><span>Running</span><strong>{event.payload.name}</strong></div>;
  if (event.type === "tool.result") return <div className={`tool-row ${event.payload.isError ? "failed" : "complete"}`}><span className="tool-state">{event.payload.isError ? "×" : "✓"}</span><span>{event.payload.isError ? "Failed" : "Complete"}</span><strong>{event.payload.name}</strong></div>;
  if (event.type === "session.error") return <div className="notice error" role="alert">{event.payload.message}</div>;
  if (event.type === "context.compacted") return <div className="notice">Older context was compacted.</div>;
  return null;
}

function sessionTitle(session: SessionSummary): string {
  return session.lastUserMessage ?? session.firstUserMessage ?? "New session";
}

export function AxlApp(): React.JSX.Element {
  const [client, setClient] = useState<AxlClient>();
  const [bootstrap, setBootstrap] = useState<WebBootstrap>();
  const [sessions, setSessions] = useState<readonly SessionSummary[]>([]);
  const [opened, setOpened] = useState<SessionOpenResult>();
  const [conversation, setConversation] = useState<ConversationState>(EMPTY_STATE);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [connection, setConnection] = useState("Connecting");
  const [error, setError] = useState<string>();
  const subscription = useRef<SessionSubscription | undefined>(undefined);
  const transcript = useRef<HTMLDivElement>(null);

  const refreshSessions = async (current: AxlClient): Promise<readonly SessionSummary[]> => {
    const result = await current.request("session.list", { scope: "all_local", order: "recent", pageSize: 100 });
    setSessions(result.sessions);
    return result.sessions;
  };

  const openSession = async (current: AxlClient, sessionId: SessionId): Promise<void> => {
    setBusy(true); setError(undefined); setSidebarOpen(false);
    try {
      const next = await current.request("session.resume", { sessionId });
      await subscription.current?.close();
      setConversation(EMPTY_STATE);
      const nextSubscription = await subscribeSession(current, next.sessionId, {
        onChange: (projector) => setConversation(projector.state),
        onResyncRequired: (cause) => setError(cause.message),
      });
      subscription.current = nextSubscription;
      setOpened(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not open the session");
    } finally { setBusy(false); }
  };

  useEffect(() => {
    let disposed = false;
    let activeClient: AxlClient | undefined;
    void connectWebEnvironment().then(async (environment) => {
      if (disposed) { environment.client.close(); return; }
      activeClient = environment.client; setClient(environment.client); setBootstrap(environment.bootstrap); setConnection("Connected");
      environment.client.onStateChange((state) => !disposed && setConnection(state === "connected" ? "Connected" : state));
      await refreshSessions(environment.client);
      if (environment.selectedSessionId !== undefined) {
        await openSession(environment.client, environment.selectedSessionId);
      } else {
        const created = await environment.client.request("session.create", {
          cwd: environment.bootstrap.cwd,
          profile: "standard",
        });
        await refreshSessions(environment.client);
        await openSession(environment.client, created.sessionId);
      }
    }).catch((cause: unknown) => !disposed && setError(cause instanceof Error ? cause.message : "Could not start Axl web"));
    return () => { disposed = true; subscription.current?.detach(); activeClient?.close(); };
  }, []);

  useEffect(() => { transcript.current?.scrollTo({ top: transcript.current.scrollHeight }); }, [conversation.records.length, conversation.activity?.sequence]);

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
    catch (cause) { setDraft((current) => current || text); setError(cause instanceof Error ? cause.message : "Message was not sent"); }
    finally { setBusy(false); }
  };

  const interrupt = async (): Promise<void> => {
    if (!client || !opened) return;
    try { await client.request("session.interrupt", { sessionId: opened.sessionId }); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not interrupt the session"); }
  };

  const selectedSummary = sessions.find((item) => item.sessionId === opened?.sessionId);
  const currentTitle = selectedSummary === undefined ? "Current session" : sessionTitle(selectedSummary);

  return <main className="shell">
    <button className="mobile-menu" aria-label="Open sessions" onClick={() => setSidebarOpen(true)}><span></span><span></span><span></span></button>
    {sidebarOpen && <button className="scrim" aria-label="Close sessions" onClick={() => setSidebarOpen(false)} />}
    <aside className={sidebarOpen ? "sidebar open" : "sidebar"} aria-label="Sessions">
      <div className="brand"><span className="brand-mark">◆</span><strong>Axl</strong></div>
      <div className="workspace-actions"><span>Workspace</span><button aria-label="New session" onClick={() => void createSession()}>＋</button></div>
      <label className="search"><span aria-hidden="true">⌕</span><input aria-label="Search sessions" placeholder="Search sessions" /></label>
      <nav>{sessions.map((session) => <button key={session.sessionId} className={session.sessionId === opened?.sessionId ? "session active" : "session"} onClick={() => client && void openSession(client, session.sessionId)}><span className={`status-dot ${session.runtime.state}`}></span><span><strong>{sessionTitle(session)}</strong><small>{session.cwd}</small></span></button>)}</nav>
      <div className="daemon"><span className="status-dot idle"></span><span><strong>Local daemon</strong><small>{opened?.runtime.state ?? "Ready"} · {connection}</small></span></div>
    </aside>
    <section className="workspace">
      <header className="topbar"><div><span className="crumb">Sessions</span><span className="separator">›</span><strong>{opened ? currentTitle : "Select a session"}</strong></div><div className="top-actions"><span className="connection"><i></i>{connection}</span>{conversation.profile && <span>{conversation.profile}</span>}{conversation.model && <span>{conversation.model}</span>}</div></header>
      <div className="thread" ref={transcript}>
        {opened ? <div className="thread-inner"><div className="thread-title"><h1>{currentTitle}</h1><p>{opened.cwd}</p></div>{conversation.records.map((record) => record.kind === "event" ? <EventRow key={record.event.id} event={record.event} /> : null)}{conversation.activity && <article className="message assistant live"><span className="avatar axl">◆</span><div><header><strong>Axl</strong><time>working</time></header>{conversation.activity.thinking && <details><summary>Thinking</summary><p>{conversation.activity.thinking}</p></details>}<p>{conversation.activity.text || "Working…"}</p></div></article>}</div> : <div className="empty"><span className="brand-mark large">◆</span><h1>No session selected</h1><p>Resume a durable session or start one in this workspace.</p><button onClick={() => void createSession()}>New session</button></div>}
      </div>
      {error && <div className="error-banner" role="alert"><span>{error}</span><button aria-label="Dismiss error" onClick={() => setError(undefined)}>×</button></div>}
      {opened && <form className="composer" onSubmit={(event) => { event.preventDefault(); void send(); }}><textarea value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); } }} placeholder="Ask Axl…" aria-label="Message" rows={3} disabled={busy} /><div className="composer-footer"><span>{conversation.profile ?? opened.profile}</span><span>{conversation.model ?? "Daemon default"}{conversation.thinking ? ` · ${conversation.thinking}` : ""}</span>{conversation.activeOperationId ? <button type="button" className="send" onClick={() => void interrupt()}>Stop</button> : <button className="send" disabled={!draft.trim() || busy}>{busy ? "Sending…" : "Send"}</button>}</div></form>}
    </section>
  </main>;
}
