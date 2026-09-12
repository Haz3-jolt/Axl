// SPDX-FileCopyrightText: 2026 Hari Srinivasan
// SPDX-License-Identifier: Apache-2.0

import { parseBlobReference, type BlobReference, type SessionId } from "@axl/protocol";

import type { AxlClient } from "./client.ts";

export const MAX_UPLOAD_BLOB_BYTES = 20 * 1024 * 1024;
const MAX_UPLOAD_CHUNK_BYTES = 384 * 1024;

export interface BlobUploadOptions {
  readonly mediaType: string;
  readonly name?: string;
  readonly signal?: AbortSignal;
  readonly onProgress?: (uploadedBytes: number, totalBytes: number) => void;
}

function base64(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.byteLength; offset += 32_768) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 32_768));
  }
  return btoa(binary);
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", copy.buffer);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function uploadBlob(
  client: AxlClient,
  sessionId: SessionId,
  bytes: Uint8Array,
  options: BlobUploadOptions,
): Promise<BlobReference> {
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_UPLOAD_BLOB_BYTES) {
    throw new Error(`Attachments must contain between 1 and ${MAX_UPLOAD_BLOB_BYTES} bytes`);
  }
  options.signal?.throwIfAborted();
  const requestOptions = options.signal === undefined ? {} : { signal: options.signal };
  const started = await client.request(
    "session.blob.start",
    {
      sessionId,
      mediaType: options.mediaType,
      sizeBytes: bytes.byteLength,
      ...(options.name === undefined ? {} : { name: options.name }),
    },
    requestOptions,
  );
  const chunkBytes = Math.min(MAX_UPLOAD_CHUNK_BYTES, started.chunkBytes);
  if (!started.uploadId || !Number.isSafeInteger(chunkBytes) || chunkBytes <= 0) {
    throw new Error("Daemon returned an invalid blob upload contract");
  }
  try {
    for (let offset = 0; offset < bytes.byteLength; offset += chunkBytes) {
      options.signal?.throwIfAborted();
      const chunk = bytes.subarray(offset, Math.min(bytes.byteLength, offset + chunkBytes));
      const response = await client.request(
        "session.blob.chunk",
        {
          sessionId,
          uploadId: started.uploadId,
          offset,
          data: base64(chunk),
        },
        requestOptions,
      );
      if (response.nextOffset !== offset + chunk.byteLength) {
        throw new Error("Daemon returned an invalid blob upload offset");
      }
      options.onProgress?.(response.nextOffset, bytes.byteLength);
    }
    const reference = parseBlobReference(
      await client.request(
        "session.blob.commit",
        { sessionId, uploadId: started.uploadId },
        requestOptions,
      ),
    );
    if (
      reference.sha256 !== (await sha256(bytes)) ||
      reference.sizeBytes !== bytes.byteLength ||
      reference.mediaType !== options.mediaType
    ) {
      throw new Error("Daemon returned a blob reference that does not match the upload");
    }
    return reference;
  } catch (error) {
    try {
      await client.request("session.blob.abort", { sessionId, uploadId: started.uploadId });
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], "Blob upload and cleanup failed");
    }
    throw error;
  }
}
