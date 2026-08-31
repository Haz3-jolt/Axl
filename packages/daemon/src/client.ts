// SPDX-FileCopyrightText: 2026 Hari Srinivasan
// SPDX-License-Identifier: Apache-2.0

import { connect, type Socket } from "node:net";

import {
  encodeWireMessage,
  parseServerMessage,
  parseWireRequest,
  WIRE_PROTOCOL_VERSION,
  type WireEvent,
  type WireMethod,
} from "@axl/protocol";

export class WireClientError extends Error {
  readonly code: string;

  constructor(code: string, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "WireClientError";
    this.code = code;
  }
}

const MAX_LINE_BYTES = 1_048_576;
const HANDSHAKE_TIMEOUT_MS = 5_000;

/** Thin local client. Session state and the agent loop remain in the daemon. */
export class DaemonClient {
  private readonly socket: Socket;
  private readonly ready: Promise<void>;
  private settleReady: ((error?: Error) => void) | undefined;
  private nextId = 1;
  private buffer = "";
  private helloReceived = false;
  private closed = false;
  private readonly pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >();
  private readonly eventListeners = new Set<(event: WireEvent) => void>();

  private constructor(socket: Socket) {
    this.socket = socket;
    this.ready = new Promise<void>((resolve, reject) => {
      this.settleReady = (error) => {
        this.settleReady = undefined;
        if (error) reject(error);
        else resolve();
      };
    });
    socket.on("data", (chunk) => this.receive(chunk));
    socket.once("error", (cause) =>
      this.fail(new WireClientError("connection_error", cause.message, { cause })),
    );
    socket.once("close", () =>
      this.fail(new WireClientError("disconnected", "Daemon connection closed")),
    );
  }

  static async connect(socketPath: string): Promise<DaemonClient> {
    const socket = connect(socketPath);
    const client = new DaemonClient(socket);
    const timeout = setTimeout(
      () =>
        client.fail(
          new WireClientError("handshake_timeout", "Daemon did not send a protocol hello"),
        ),
      HANDSHAKE_TIMEOUT_MS,
    );
    timeout.unref();
    try {
      await client.ready;
      return client;
    } finally {
      clearTimeout(timeout);
    }
  }

  request(method: WireMethod, params: Record<string, unknown>): Promise<unknown> {
    if (this.closed)
      return Promise.reject(new WireClientError("disconnected", "Daemon connection is closed"));
    const id = this.nextId++;
    let request: ReturnType<typeof parseWireRequest>;
    try {
      request = parseWireRequest({ kind: "request", id, method, params });
    } catch (cause) {
      return Promise.reject(new WireClientError("bad_request", "Invalid request", { cause }));
    }
    const response = new Promise<unknown>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
    try {
      this.socket.write(encodeWireMessage(request), (error) => {
        if (error) {
          this.rejectRequest(
            id,
            new WireClientError("write_failed", error.message, { cause: error }),
          );
        }
      });
    } catch (cause) {
      this.rejectRequest(
        id,
        new WireClientError("write_failed", "Could not write to daemon", { cause }),
      );
    }
    return response;
  }

  onEvent(listener: (event: WireEvent) => void): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  close(): void {
    if (!this.closed) this.socket.destroy();
  }

  private receive(chunk: Buffer): void {
    this.buffer += chunk.toString("utf8");
    if (Buffer.byteLength(this.buffer) > MAX_LINE_BYTES && !this.buffer.includes("\n")) {
      this.fail(new WireClientError("frame_too_large", "Daemon message exceeded the size limit"));
      return;
    }
    for (
      let newline = this.buffer.indexOf("\n");
      newline !== -1;
      newline = this.buffer.indexOf("\n")
    ) {
      const line = this.buffer.slice(0, newline);
      this.buffer = this.buffer.slice(newline + 1);
      if (Buffer.byteLength(line) > MAX_LINE_BYTES) {
        this.fail(new WireClientError("frame_too_large", "Daemon message exceeded the size limit"));
        return;
      }
      if (line.trim()) {
        try {
          this.handleMessage(parseServerMessage(JSON.parse(line) as unknown));
        } catch (cause) {
          this.fail(
            new WireClientError("protocol_error", "Daemon sent an invalid message", { cause }),
          );
          return;
        }
      }
    }
  }

  private handleMessage(message: ReturnType<typeof parseServerMessage>): void {
    if (!this.helloReceived) {
      if (message.kind !== "hello") {
        this.fail(new WireClientError("protocol_error", "Daemon did not send hello first"));
      } else if (message.wireVersion !== WIRE_PROTOCOL_VERSION) {
        this.fail(
          new WireClientError(
            "version_mismatch",
            `Daemon speaks wire version ${message.wireVersion}, client requires ${WIRE_PROTOCOL_VERSION}`,
          ),
        );
      } else {
        this.helloReceived = true;
        this.settleReady?.();
      }
      return;
    }
    if (message.kind === "hello") {
      this.fail(new WireClientError("protocol_error", "Daemon sent a second hello"));
    } else if (message.kind === "response") {
      const pending = this.pending.get(message.id);
      if (pending === undefined) {
        this.fail(
          new WireClientError("protocol_error", `Daemon answered unknown request ${message.id}`),
        );
        return;
      }
      this.pending.delete(message.id);
      pending.resolve(message.result);
    } else if (message.kind === "error") {
      this.rejectRequest(message.id, new WireClientError(message.code, message.message));
    } else {
      for (const listener of this.eventListeners) listener(message);
    }
  }

  private rejectRequest(id: number, error: Error): void {
    this.pending.get(id)?.reject(error);
    this.pending.delete(id);
  }

  private fail(error: Error): void {
    if (this.closed) return;
    this.closed = true;
    this.settleReady?.(error);
    for (const { reject } of this.pending.values()) reject(error);
    this.pending.clear();
    this.socket.destroy();
  }
}
