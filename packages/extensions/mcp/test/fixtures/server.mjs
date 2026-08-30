// SPDX-FileCopyrightText: 2026 Hari Srinivasan
// SPDX-License-Identifier: Apache-2.0

import readline from "node:readline";

let nextServerRequest = 100;
const pending = new Map();
const tasks = new Map();

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function request(method, params = {}) {
  const id = nextServerRequest++;
  send({ jsonrpc: "2.0", id, method, params });
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

async function handle(message) {
  if (message.id !== undefined && (message.result !== undefined || message.error !== undefined)) {
    const waiting = pending.get(message.id);
    if (!waiting) return;
    pending.delete(message.id);
    if (message.error) waiting.reject(new Error(message.error.message));
    else waiting.resolve(message.result);
    return;
  }
  if (message.method === "notifications/initialized" || message.method === "notifications/cancelled") return;
  const result = async () => {
    switch (message.method) {
      case "initialize":
        return {
          protocolVersion: "2025-11-25",
          capabilities: {
            tools: { listChanged: true },
            resources: { subscribe: true, listChanged: true },
            prompts: { listChanged: true },
            completions: {},
            logging: {},
            tasks: { list: {}, cancel: {}, requests: { tools: { call: {} } } },
          },
          serverInfo: { name: "fixture", version: "1.0.0" },
        };
      case "ping":
      case "logging/setLevel":
      case "resources/subscribe":
      case "resources/unsubscribe":
        return {};
      case "tools/list":
        return {
          tools: [
            {
              name: "echo",
              description: "Echo text",
              inputSchema: {
                type: "object",
                properties: { text: { type: "string" } },
                required: ["text"],
              },
              annotations: { readOnlyHint: true },
            },
            {
              name: "interactive",
              description: "Exercise client capabilities",
              inputSchema: { type: "object" },
            },
            {
              name: "tasker",
              description: "Exercise task execution",
              inputSchema: { type: "object" },
              execution: { taskSupport: "required" },
            },
          ],
        };
      case "tools/call": {
        if (message.params.name === "tasker") {
          if (!message.params.task) throw Object.assign(new Error("Task required"), { code: -32600 });
          const now = new Date().toISOString();
          const task = {
            taskId: "task-1",
            status: "working",
            createdAt: now,
            lastUpdatedAt: now,
            ttl: message.params.task.ttl ?? null,
            pollInterval: 1,
          };
          tasks.set(task.taskId, {
            ...task,
            status: "completed",
            result: { content: [{ type: "text", text: "task complete" }] },
          });
          return { task };
        }
        if (message.params.name === "interactive") {
          const roots = await request("roots/list");
          const elicitationTask = await request("elicitation/create", {
            mode: "form",
            message: "Confirm the fixture",
            requestedSchema: {
              type: "object",
              properties: { confirm: { type: "boolean" } },
              required: ["confirm"],
            },
            task: { ttl: 60_000 },
          });
          const elicited = await request("tasks/result", {
            taskId: elicitationTask.task.taskId,
          });
          const samplingTask = await request("sampling/createMessage", {
            messages: [{ role: "user", content: { type: "text", text: "Say fixture" } }],
            maxTokens: 16,
            task: { ttl: 60_000 },
          });
          const sampled = await request("tasks/result", {
            taskId: samplingTask.task.taskId,
          });
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({ roots, elicited, sampled }),
              },
            ],
          };
        }
        return { content: [{ type: "text", text: String(message.params.arguments?.text ?? "") }] };
      }
      case "resources/list":
        return { resources: [{ uri: "fixture://readme", name: "README" }] };
      case "resources/templates/list":
        return { resourceTemplates: [{ uriTemplate: "fixture://{name}", name: "Fixture" }] };
      case "resources/read":
        return { contents: [{ uri: message.params.uri, mimeType: "text/plain", text: "resource" }] };
      case "prompts/list":
        return { prompts: [{ name: "review", arguments: [{ name: "topic", required: true }] }] };
      case "prompts/get":
        return {
          messages: [{ role: "user", content: { type: "text", text: `Review ${message.params.arguments?.topic}` } }],
        };
      case "completion/complete":
        return { completion: { values: ["typescript"], total: 1, hasMore: false } };
      case "tasks/list":
        return {
          tasks: [...tasks.values()].map(({ result: _result, ...task }) => task),
        };
      case "tasks/get": {
        const task = tasks.get(message.params.taskId);
        if (!task) throw Object.assign(new Error("Unknown task"), { code: -32602 });
        const { result: _result, ...status } = task;
        return status;
      }
      case "tasks/result": {
        const task = tasks.get(message.params.taskId);
        if (!task) throw Object.assign(new Error("Unknown task"), { code: -32602 });
        return {
          ...task.result,
          _meta: { "io.modelcontextprotocol/related-task": { taskId: message.params.taskId } },
        };
      }
      case "tasks/cancel": {
        const task = tasks.get(message.params.taskId);
        if (!task) throw Object.assign(new Error("Unknown task"), { code: -32602 });
        if (["completed", "failed", "cancelled"].includes(task.status)) {
          throw Object.assign(new Error("Task already terminal"), { code: -32602 });
        }
        task.status = "cancelled";
        task.lastUpdatedAt = new Date().toISOString();
        const { result: _result, ...status } = task;
        return status;
      }
      default:
        throw Object.assign(new Error(`Unknown method ${message.method}`), { code: -32601 });
    }
  };
  if (message.id === undefined) return;
  try {
    send({ jsonrpc: "2.0", id: message.id, result: await result() });
  } catch (error) {
    send({
      jsonrpc: "2.0",
      id: message.id,
      error: { code: Number.isInteger(error.code) ? error.code : -32603, message: error.message },
    });
  }
}

const lines = readline.createInterface({ input: process.stdin });
lines.on("line", (line) => {
  void handle(JSON.parse(line));
});
