// SPDX-FileCopyrightText: 2026 Hari Srinivasan
// SPDX-License-Identifier: Apache-2.0

import { type CanonicalEvent, type EventId, type SessionId, parseSessionId } from "@axl/protocol";

export class SessionTreeIntegrityError extends Error {
  readonly index: number;
  readonly eventId: EventId | null;

  constructor(index: number, eventId: EventId | null, message: string) {
    super(`Event ${eventId ?? "<unknown>"} at log index ${index}: ${message}`);
    this.name = "SessionTreeIntegrityError";
    this.index = index;
    this.eventId = eventId;
  }
}

interface SessionTreeNode {
  readonly event: CanonicalEvent;
  readonly children: EventId[];
}

export class SessionTree {
  readonly sessionId: SessionId;
  private readonly nodes: Map<EventId, SessionTreeNode>;
  private readonly root: EventId | null;

  private constructor(
    sessionId: SessionId,
    nodes: Map<EventId, SessionTreeNode>,
    root: EventId | null,
  ) {
    this.sessionId = sessionId;
    this.nodes = nodes;
    this.root = root;
  }

  /**
   * Reconstructs a session tree from events in log-append order. Every parent
   * must be appended before its children, so one ordered pass detects duplicate
   * IDs, missing parents, cycles, competing roots, and cross-session events.
   */
  static fromEvents(sessionId: unknown, events: readonly CanonicalEvent[]): SessionTree {
    const expectedSessionId = parseSessionId(sessionId, "sessionId");
    const nodes = new Map<EventId, SessionTreeNode>();
    let root: EventId | null = null;

    for (const [index, event] of events.entries()) {
      if (event.sessionId !== expectedSessionId) {
        throw new SessionTreeIntegrityError(
          index,
          event.id,
          `belongs to session ${event.sessionId}, not ${expectedSessionId}`,
        );
      }
      if (nodes.has(event.id)) {
        throw new SessionTreeIntegrityError(index, event.id, "duplicates an earlier event ID");
      }
      if (event.parentId === null) {
        if (root !== null) {
          throw new SessionTreeIntegrityError(
            index,
            event.id,
            `is a second root; the tree is already rooted at ${root}`,
          );
        }
        root = event.id;
      } else {
        const parent = nodes.get(event.parentId);
        if (parent === undefined) {
          throw new SessionTreeIntegrityError(
            index,
            event.id,
            `references parent ${event.parentId}, which does not precede it in the log`,
          );
        }
        parent.children.push(event.id);
      }
      nodes.set(event.id, { event, children: [] });
    }

    return new SessionTree(expectedSessionId, nodes, root);
  }

  get rootId(): EventId | null {
    return this.root;
  }

  get size(): number {
    return this.nodes.size;
  }

  has(id: EventId): boolean {
    return this.nodes.has(id);
  }

  event(id: EventId): CanonicalEvent {
    return this.node(id).event;
  }

  childrenOf(id: EventId): readonly EventId[] {
    return [...this.node(id).children];
  }

  /** Every event in log-append order. */
  events(): readonly CanonicalEvent[] {
    return [...this.nodes.values()].map((node) => node.event);
  }

  /** Every branch tip in log-append order; each represents a preserved historical branch. */
  leaves(): readonly EventId[] {
    return [...this.nodes.values()]
      .filter((node) => node.children.length === 0)
      .map((node) => node.event.id);
  }

  /** The unique path from the root to `id`, inclusive. */
  lineage(id: EventId): readonly CanonicalEvent[] {
    const path: CanonicalEvent[] = [];
    for (
      let current: EventId | null = id;
      current !== null;
      current = path[path.length - 1]?.parentId ?? null
    ) {
      path.push(this.node(current).event);
    }
    return path.reverse();
  }

  private node(id: EventId): SessionTreeNode {
    const node = this.nodes.get(id);
    if (node === undefined) {
      throw new SessionTreeIntegrityError(-1, id, "is not part of this session tree");
    }
    return node;
  }
}
