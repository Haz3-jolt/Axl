// SPDX-FileCopyrightText: 2026 Hari Srinivasan
// SPDX-License-Identifier: Apache-2.0

import { resolve } from "node:path";

import { assertWriteAllowed, canonicalizeForPolicy, type WorkspacePolicy } from "../path-policy.ts";

interface QueueRegistration {
  readonly path: string;
  readonly previous: Promise<void>;
  readonly tail: Promise<void>;
  readonly release: () => void;
}

const queues = new Map<string, Promise<void>>();
let registration = Promise.resolve();

/** Serializes mutations to one canonical path while allowing different files to proceed. */
export async function withFileMutationQueue<T>(
  cwd: string,
  requestedPath: string,
  policy: WorkspacePolicy | undefined,
  mutate: (path: string) => Promise<T>,
): Promise<T> {
  const registered = registration.then(async (): Promise<QueueRegistration> => {
    const absolutePath = resolve(cwd, requestedPath);
    const path =
      policy === undefined
        ? await canonicalizeForPolicy(absolutePath)
        : await assertWriteAllowed(policy, absolutePath);
    const previous = queues.get(path) ?? Promise.resolve();
    let release = (): void => undefined;
    const current = new Promise<void>((resolveCurrent) => {
      release = resolveCurrent;
    });
    const tail = previous.then(() => current);
    queues.set(path, tail);
    return { path, previous, tail, release };
  });
  registration = registered.then(
    () => undefined,
    () => undefined,
  );

  const entry = await registered;
  await entry.previous;
  try {
    return await mutate(entry.path);
  } finally {
    entry.release();
    if (queues.get(entry.path) === entry.tail) queues.delete(entry.path);
  }
}
