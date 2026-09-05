// SPDX-FileCopyrightText: 2026 Hari Srinivasan
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import test from "node:test";
import { HOST_CONTROL_VERSION, parseHostRequest, parseHostResponse } from "../src/index.ts";

const instanceId = "00000000-0000-4000-8000-000000000001";

test("host control validates its independent version, exact request shapes, and shutdown consent", () => {
  const status = {
    kind: "host.request",
    version: HOST_CONTROL_VERSION,
    method: "status",
    context: {},
  };
  assert.deepEqual(parseHostRequest(status), status);
  for (const invalid of [
    { ...status, version: 99 },
    { ...status, context: { sessionId: "invalid" } },
    { ...status, interrupt: true },
    { ...status, method: "kill" },
  ])
    assert.throws(() => parseHostRequest(invalid));
  const shutdown = {
    ...status,
    method: "shutdown",
    instanceId,
    revision: "snapshot",
    interrupt: true,
    confirmed: false,
  };
  assert.deepEqual(parseHostRequest(shutdown), shutdown);
  assert.throws(() => parseHostRequest({ ...shutdown, confirmed: "yes" }));
  assert.throws(() => parseHostRequest({ ...shutdown, instanceId: "1" }));
  assert.deepEqual(
    parseHostRequest({ kind: "host.request", version: 1, method: "force", instanceId }),
    { kind: "host.request", version: 1, method: "force", instanceId },
  );
});

test("host status rejects invalid response shapes rather than assuming an idle daemon", () => {
  assert.throws(() =>
    parseHostResponse({ kind: "host.response", version: 1, status: { busy: false } }),
  );
  assert.throws(() =>
    parseHostResponse({
      kind: "host.response",
      version: 99,
      error: { code: "failed", message: "failed" },
    }),
  );
  assert.throws(() =>
    parseHostResponse({
      kind: "host.response",
      version: 1,
      status: {},
      error: { code: "failed", message: "failed" },
    }),
  );
  const response = {
    kind: "host.response",
    version: 1,
    error: { code: "state_changed", message: "Inspect again" },
  };
  assert.deepEqual(parseHostResponse(response), response);
});
