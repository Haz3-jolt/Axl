// SPDX-FileCopyrightText: 2026 Hari Srinivasan
// SPDX-License-Identifier: Apache-2.0

import { join } from "node:path";
import { AxlDaemon } from "@axl/daemon";
import { ToolRegistry } from "@axl/kernel";

const [directory, mode] = process.argv.slice(2);
const daemon = new AxlDaemon({
  socketPath: join(directory, "axl.sock"),
  dataDirectory: directory,
  buildVersion: "lifecycle-fixture",
  securityMode: "unsafe",
  sandboxProvider: "none",
  onStopped: () => process.exit(0),
  forceTerminate: () => process.exit(1),
  runtime: () => ({
    tools: new ToolRegistry(),
    model: {
      async *stream(request) {
        if (mode === "active") {
          if (!request.signal.aborted) await new Promise((resolve) => request.signal.addEventListener("abort", resolve, { once: true }));
          yield { type: "aborted" };
        } else {
          yield { type: "completed", stopReason: "stop", usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 } };
        }
      },
    },
    extensionHost: {
      activate() {},
      async dispose() {
        if (mode === "hang") await new Promise(() => {});
        if (mode === "fail") throw new Error("fixture cleanup failure");
      },
    },
  }),
});
await daemon.start();
process.send?.("ready");
process.on("SIGTERM", () => { void daemon.stop().catch((error) => console.error(error.message)); });
