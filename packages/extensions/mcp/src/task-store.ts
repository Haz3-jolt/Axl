// SPDX-FileCopyrightText: 2026 Hari Srinivasan
// SPDX-License-Identifier: Apache-2.0

import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import type {
  CreateTaskOptions,
  TaskStore,
} from "@modelcontextprotocol/sdk/experimental/tasks/index.js";
import type { Request, RequestId, Result, Task } from "@modelcontextprotocol/sdk/types.js";
import { redactJsonValue } from "@kepler/kernel";
import type { JsonValue } from "@kepler/protocol";

const PAGE_SIZE = 100;
const DEFAULT_MAX_TTL_MS = 86_400_000;

type StoredTask = {
  readonly task: Task;
  readonly requestId: RequestId;
  readonly request: Request;
  readonly sessionId?: string;
  readonly result?: Result;
};

type TaskFile = { readonly tasks: Readonly<Record<string, StoredTask>> };

function isTerminal(status: Task["status"]): boolean {
  return status === "completed" || status === "failed" || status === "cancelled";
}

function belongs(task: StoredTask, sessionId: string | undefined): boolean {
  return task.sessionId === sessionId;
}

export class FileTaskStore implements TaskStore {
  private readonly path: string;
  private readonly maxTtlMs: number;
  private readonly secretValues: () => readonly string[];
  private tail: Promise<void> = Promise.resolve();

  constructor(
    path: string,
    options: {
      readonly maxTtlMs?: number;
      readonly secretValues?: readonly string[] | (() => readonly string[]);
    } = {},
  ) {
    this.path = path;
    this.maxTtlMs = options.maxTtlMs ?? DEFAULT_MAX_TTL_MS;
    const secretValues = options.secretValues;
    this.secretValues =
      typeof secretValues === "function" ? secretValues : () => secretValues ?? [];
  }

  private redact<T>(value: T): T {
    return redactJsonValue(value as JsonValue, this.secretValues()) as T;
  }

  private async read(): Promise<Map<string, StoredTask>> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(await readFile(this.path, "utf8")) as unknown;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return new Map();
      throw new Error(`Cannot read MCP task state ${this.path}`, { cause: error });
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error(`MCP task state ${this.path} is not an object`);
    }
    const tasks = (parsed as { tasks?: unknown }).tasks;
    if (typeof tasks !== "object" || tasks === null || Array.isArray(tasks)) {
      throw new Error(`MCP task state ${this.path} has no task map`);
    }
    const now = Date.now();
    return new Map(
      Object.entries(tasks as Record<string, StoredTask>).filter(([, stored]) => {
        const expires =
          stored.task.ttl === null
            ? Number.POSITIVE_INFINITY
            : Date.parse(stored.task.createdAt) + stored.task.ttl;
        return Number.isFinite(expires) && expires > now;
      }),
    );
  }

  private async write(tasks: Map<string, StoredTask>): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
    const temporary = `${this.path}.${randomUUID()}.tmp`;
    const file: TaskFile = { tasks: Object.fromEntries(tasks) };
    try {
      await writeFile(temporary, `${JSON.stringify(file, null, 2)}\n`, { mode: 0o600 });
      await rename(temporary, this.path);
    } finally {
      await rm(temporary, { force: true });
    }
  }

  private transaction<T>(operation: (tasks: Map<string, StoredTask>) => Promise<T>): Promise<T> {
    const result = this.tail.then(async () => {
      const tasks = await this.read();
      const value = await operation(tasks);
      await this.write(tasks);
      return value;
    });
    this.tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  async createTask(
    options: CreateTaskOptions,
    requestId: RequestId,
    request: Request,
    sessionId?: string,
  ): Promise<Task> {
    return this.transaction(async (tasks) => {
      const now = new Date().toISOString();
      const requestedTtl = options.ttl;
      const ttl =
        requestedTtl === null
          ? this.maxTtlMs
          : Math.min(requestedTtl ?? this.maxTtlMs, this.maxTtlMs);
      const task: Task = {
        taskId: randomBytes(16).toString("hex"),
        status: "working",
        createdAt: now,
        lastUpdatedAt: now,
        ttl,
        pollInterval: options.pollInterval ?? 1_000,
      };
      tasks.set(task.taskId, {
        task,
        requestId,
        request: this.redact(request),
        ...(sessionId === undefined ? {} : { sessionId }),
      });
      return task;
    });
  }

  async getTask(taskId: string, sessionId?: string): Promise<Task | null> {
    await this.tail;
    const task = (await this.read()).get(taskId);
    return task && belongs(task, sessionId) ? task.task : null;
  }

  async storeTaskResult(
    taskId: string,
    status: "completed" | "failed",
    result: Result,
    sessionId?: string,
  ): Promise<void> {
    await this.transaction(async (tasks) => {
      const stored = tasks.get(taskId);
      if (!stored || !belongs(stored, sessionId)) throw new Error(`Task ${taskId} not found`);
      if (isTerminal(stored.task.status)) throw new Error(`Task ${taskId} is already terminal`);
      tasks.set(taskId, {
        ...stored,
        task: { ...stored.task, status, lastUpdatedAt: new Date().toISOString() },
        result: this.redact(result),
      });
    });
  }

  async getTaskResult(taskId: string, sessionId?: string): Promise<Result> {
    await this.tail;
    const stored = (await this.read()).get(taskId);
    if (!stored || !belongs(stored, sessionId)) throw new Error(`Task ${taskId} not found`);
    if (!isTerminal(stored.task.status) || stored.result === undefined) {
      throw new Error(`Task ${taskId} has no terminal result`);
    }
    return stored.result;
  }

  async updateTaskStatus(
    taskId: string,
    status: Task["status"],
    statusMessage?: string,
    sessionId?: string,
  ): Promise<void> {
    await this.transaction(async (tasks) => {
      const stored = tasks.get(taskId);
      if (!stored || !belongs(stored, sessionId)) throw new Error(`Task ${taskId} not found`);
      if (isTerminal(stored.task.status)) throw new Error(`Task ${taskId} is already terminal`);
      tasks.set(taskId, {
        ...stored,
        task: {
          ...stored.task,
          status,
          lastUpdatedAt: new Date().toISOString(),
          ...(statusMessage === undefined ? {} : { statusMessage }),
        },
      });
    });
  }

  async listTasks(
    cursor?: string,
    sessionId?: string,
  ): Promise<{ tasks: Task[]; nextCursor?: string }> {
    await this.tail;
    const entries = [...(await this.read()).values()].filter((task) => belongs(task, sessionId));
    const start =
      cursor === undefined ? 0 : entries.findIndex((task) => task.task.taskId === cursor) + 1;
    if (cursor !== undefined && start === 0) throw new Error(`Invalid task cursor ${cursor}`);
    const page = entries.slice(start, start + PAGE_SIZE);
    const nextCursor = start + PAGE_SIZE < entries.length ? page.at(-1)?.task.taskId : undefined;
    return {
      tasks: page.map((stored) => stored.task),
      ...(nextCursor === undefined ? {} : { nextCursor }),
    };
  }
}
