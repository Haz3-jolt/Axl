// SPDX-FileCopyrightText: 2026 Hari Srinivasan
// SPDX-License-Identifier: Apache-2.0

import { useState } from "react";
import type { WorkspaceDiffResult, WorkspaceStatusResult } from "@axl/sdk";
import { highlightLine, languageForPath } from "@axl/ui";
import { workspaceTotals } from "./view-state.ts";

export interface WorkspaceReview {
  readonly status: WorkspaceStatusResult;
  readonly diffs: readonly WorkspaceDiffResult[];
  readonly truncated?: boolean;
}

function DiffContent({ diff }: { readonly diff: WorkspaceDiffResult }): React.JSX.Element {
  const language = languageForPath(diff.entry.path);
  const additions = diff.hunks.flatMap((hunk) => hunk.lines).filter((line) => line.kind === "addition").length;
  const deletions = diff.hunks.flatMap((hunk) => hunk.lines).filter((line) => line.kind === "deletion").length;
  return <section className="selected-diff" aria-label={`Changes in ${diff.entry.path}`}>
    <header><div><strong>{diff.entry.path.split("/").at(-1)}</strong><span>{diff.entry.path.includes("/") ? diff.entry.path.slice(0, diff.entry.path.lastIndexOf("/")) : ""}</span></div><ChangeStats additions={additions} deletions={deletions} /></header>
    {diff.binary ? <p className="binary-change">Binary file changed</p> : <div className="workspace-diff" role="table">{diff.hunks.flatMap((hunk, hunkIndex) => [<div className="workspace-hunk" role="row" key={`${hunkIndex}:header`}><code role="cell">{hunk.header}</code></div>, ...hunk.lines.map((line, lineIndex) => <div className={`workspace-diff-row ${line.kind}`} role="row" key={`${hunkIndex}:${lineIndex}`}><span role="cell">{line.oldLine ?? ""}</span><span role="cell">{line.newLine ?? ""}</span><i aria-hidden="true">{line.kind === "addition" ? "+" : line.kind === "deletion" ? "−" : ""}</i><code role="cell" dangerouslySetInnerHTML={{ __html: highlightLine(line.text || " ", language) }} /></div>)])}</div>}
  </section>;
}

function ChangeStats({ additions, deletions }: { readonly additions: number; readonly deletions: number }): React.JSX.Element {
  return <span className="diff-stats">{additions > 0 && <b>+{additions}</b>}{deletions > 0 && <i>−{deletions}</i>}</span>;
}

export function WorkspaceChanges({ review, loading, error, view, onViewChange, onClose, onRetry }: { readonly review?: WorkspaceReview | undefined; readonly loading: boolean; readonly error?: string | undefined; readonly view: "files" | "all"; readonly onViewChange: (view: "files" | "all") => void; readonly onClose: () => void; readonly onRetry: () => void }): React.JSX.Element {
  const [selectedId, setSelectedId] = useState<string>();
  const totals = workspaceTotals(review?.diffs ?? []);
  const selected = review?.diffs.find((diff) => diff.entry.entryId === selectedId) ?? review?.diffs[0];
  return <aside className="changes-panel" aria-label="Workspace changes">
    <header className="changes-header"><div><strong>Changes</strong>{review && <span>{review.status.entries.length} files</span>}</div><div className="changes-actions" role="group" aria-label="Changes layout"><button className={view === "files" ? "active" : ""} aria-label="File picker view" aria-pressed={view === "files"} onClick={() => onViewChange("files")}><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 3h4v10h-4zM6.5 3h7v10h-7" /></svg></button><button className={view === "all" ? "active" : ""} aria-label="All files view" aria-pressed={view === "all"} onClick={() => onViewChange("all")}><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 3.5h10M3 8h10M3 12.5h10" /></svg></button><button aria-label="Close changes" onClick={onClose}><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8" /></svg></button></div></header>
    {review && <div className="changes-summary"><span className="branch-name"><svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="4" cy="3" r="1.5" /><circle cx="4" cy="13" r="1.5" /><circle cx="12" cy="5.5" r="1.5" /><path d="M4 4.5v7M5.5 10c4 0 6.5-1 6.5-3" /></svg>{review.status.branch.name ?? review.status.branch.state}</span><ChangeStats additions={totals.additions} deletions={totals.deletions} /></div>}
    {loading && <div className="changes-state"><i className="loading-ring"></i><span>Loading workspace changes…</span></div>}
    {error && <div className="changes-state error"><span>{error}</span><button onClick={onRetry}>Retry</button></div>}
    {!loading && !error && review?.diffs.length === 0 && <div className="changes-state"><span>No workspace changes</span></div>}
    {review && selected && view === "files" && <div className="changes-layout"><nav aria-label="Changed files">{review.diffs.map((diff) => { const fileTotals = workspaceTotals([diff]); return <button key={diff.entry.entryId} className={diff.entry.entryId === selected.entry.entryId ? "active" : ""} onClick={() => setSelectedId(diff.entry.entryId)}><span className="changed-file-name"><strong>{diff.entry.path.split("/").at(-1)}</strong><ChangeStats additions={fileTotals.additions} deletions={fileTotals.deletions} /></span><span>{diff.entry.path.includes("/") ? diff.entry.path.slice(0, diff.entry.path.lastIndexOf("/")) : ""}</span></button>; })}</nav><DiffContent diff={selected} /></div>}
    {review && view === "all" && <div className="all-diffs">{review.diffs.map((diff) => <DiffContent key={diff.entry.entryId} diff={diff} />)}</div>}
    {review?.truncated && <p className="changes-limit">Showing the first 100 changed files.</p>}
  </aside>;
}
