// SPDX-FileCopyrightText: 2026 Hari Srinivasan
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { parseSessionId } from "@axl/protocol";
import { type AxlClient, uploadBlob } from "../src/index.ts";

const sessionId = parseSessionId("00000000-0000-4000-8000-000000000001");

test("uploads blobs in daemon-bounded chunks and verifies the committed reference", async () => {
  const bytes = new Uint8Array(10).map((_, index) => index);
  const chunks: Array<{ readonly offset: number; readonly data: string }> = [];
  const progress: number[] = [];
  const client = {
    async request(method: string, params: Record<string, unknown>) {
      if (method === "session.blob.start") return { uploadId: "upload-1", chunkBytes: 4 };
      if (method === "session.blob.chunk") {
        chunks.push({ offset: params.offset as number, data: params.data as string });
        return {
          nextOffset:
            (params.offset as number) + Buffer.from(params.data as string, "base64").byteLength,
        };
      }
      if (method === "session.blob.commit") {
        return {
          sha256: createHash("sha256").update(bytes).digest("hex"),
          mediaType: "application/octet-stream",
          sizeBytes: bytes.byteLength,
          name: "sample.bin",
        };
      }
      throw new Error(`Unexpected request ${method}`);
    },
  } as unknown as AxlClient;

  const result = await uploadBlob(client, sessionId, bytes, {
    mediaType: "application/octet-stream",
    name: "sample.bin",
    onProgress: (uploaded) => progress.push(uploaded),
  });

  assert.equal(result.name, "sample.bin");
  assert.deepEqual(
    chunks.map((chunk) => chunk.offset),
    [0, 4, 8],
  );
  assert.deepEqual(progress, [4, 8, 10]);
});

test("aborts the daemon upload after a chunk failure", async () => {
  const methods: string[] = [];
  const client = {
    async request(method: string) {
      methods.push(method);
      if (method === "session.blob.start") return { uploadId: "upload-1", chunkBytes: 4 };
      if (method === "session.blob.abort") return { aborted: true };
      throw new Error("chunk failed");
    },
  } as unknown as AxlClient;

  await assert.rejects(
    uploadBlob(client, sessionId, new Uint8Array([1]), {
      mediaType: "application/octet-stream",
    }),
    /chunk failed/,
  );
  assert.deepEqual(methods, ["session.blob.start", "session.blob.chunk", "session.blob.abort"]);
});

test("cancellation aborts an upload before sending another chunk", async () => {
  const controller = new AbortController();
  const methods: string[] = [];
  const client = {
    async request(method: string) {
      methods.push(method);
      if (method === "session.blob.start") {
        controller.abort();
        return { uploadId: "upload-1", chunkBytes: 4 };
      }
      if (method === "session.blob.abort") return { aborted: true };
      throw new Error(`Unexpected request ${method}`);
    },
  } as unknown as AxlClient;

  await assert.rejects(
    uploadBlob(client, sessionId, new Uint8Array([1]), {
      mediaType: "application/octet-stream",
      signal: controller.signal,
    }),
    { name: "AbortError" },
  );
  assert.deepEqual(methods, ["session.blob.start", "session.blob.abort"]);
});
