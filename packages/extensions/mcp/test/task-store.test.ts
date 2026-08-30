// SPDX-FileCopyrightText: 2026 Hari Srinivasan
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import type { Request } from "@modelcontextprotocol/sdk/types.js";

import { FileTaskStore } from "../src/index.ts";

const request: Request = { method: "sampling/createMessage", params: {} };

test("persists task state and results with authorization-context isolation", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "kepler-mcp-task-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, "tasks.json");
  const first = new FileTaskStore(path);
  const task = await first.createTask({ ttl: 60_000 }, 1, request, "session-a");
  await first.storeTaskResult(task.taskId, "completed", { answer: 42 }, "session-a");

  const reopened = new FileTaskStore(path);
  assert.equal((await reopened.getTask(task.taskId, "session-a"))?.status, "completed");
  assert.deepEqual(await reopened.getTaskResult(task.taskId, "session-a"), { answer: 42 });
  assert.equal(await reopened.getTask(task.taskId, "session-b"), null);
  await assert.rejects(reopened.getTaskResult(task.taskId, "session-b"), /not found/);
});

test("uses opaque cursor pagination and rejects terminal transitions", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "kepler-mcp-task-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const store = new FileTaskStore(join(directory, "tasks.json"));
  const task = await store.createTask({ ttl: null }, "request", request);
  await store.updateTaskStatus(task.taskId, "cancelled");
  await assert.rejects(store.updateTaskStatus(task.taskId, "working"), /already terminal/);
  await assert.rejects(store.listTasks("invalid"), /Invalid task cursor/);
});
