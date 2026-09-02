// SPDX-FileCopyrightText: 2026 Hari Srinivasan
// SPDX-License-Identifier: Apache-2.0

import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import type { Stats } from "node:fs";
import { lstat, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

import type {
  SessionId,
  WorkspaceDiff,
  WorkspaceDiffScope,
  WorkspaceFileDiff,
} from "@axl/protocol";

const execute = promisify(execFile);
const PATCH_LIMIT = 64 * 1024;
const RESPONSE_LIMIT = 128 * 1024;
const FILE_LIMIT = 500;
const WORKSPACE_BYTE_LIMIT = 256 * 1024 * 1024;

export class WorkspaceCheckpointError extends Error {
  readonly code: string;

  constructor(code: string, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "WorkspaceCheckpointError";
    this.code = code;
  }
}

interface CheckpointRecord {
  readonly version: 1;
  readonly checkpointId: string;
  readonly tree: string;
}

function splitNul(value: string): string[] {
  return value.split("\0").filter(Boolean);
}

function statusName(value: string): WorkspaceFileDiff["status"] {
  if (value.startsWith("A")) return "added";
  if (value.startsWith("D")) return "deleted";
  return "modified";
}

function parseNumstat(value: string): { additions: number; deletions: number } {
  const [added = "0", deleted = "0"] = value.trim().split("\t");
  return {
    additions: /^\d+$/u.test(added) ? Number(added) : 0,
    deletions: /^\d+$/u.test(deleted) ? Number(deleted) : 0,
  };
}

function isolatedGitEnvironment(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.toUpperCase().startsWith("GIT_")) delete env[key];
  }
  env.GIT_CONFIG_NOSYSTEM = "1";
  env.GIT_CONFIG_GLOBAL = process.platform === "win32" ? "NUL" : "/dev/null";
  env.LC_ALL = "C";
  return env;
}

/** Disposable Git-object checkpoints used only for daemon-owned workspace review. */
export class WorkspaceCheckpointStore {
  private readonly directory: string;
  private readonly operations = new Map<SessionId, Promise<unknown>>();

  constructor(directory: string) {
    this.directory = directory;
  }

  async has(sessionId: SessionId): Promise<boolean> {
    try {
      await stat(this.paths(sessionId).record);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw error;
    }
  }

  capture(sessionId: SessionId, cwd: string): Promise<void> {
    return this.serialized(sessionId, () => this.captureUnlocked(sessionId, cwd));
  }

  private async captureUnlocked(sessionId: SessionId, cwd: string): Promise<void> {
    const paths = this.paths(sessionId);
    await this.assertGitWorkspace(cwd);
    await this.assertBoundedWorkspace(cwd);
    await mkdir(paths.root, { recursive: true, mode: 0o700 });
    try {
      await stat(paths.git);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      await this.git(cwd, ["init", "--quiet", "--bare", paths.git]);
      await this.snapshotGit(cwd, paths.git, ["config", "core.autocrlf", "false"]);
      await this.snapshotGit(cwd, paths.git, ["config", "core.hooksPath", "/dev/null"]);
    }
    await this.snapshotGit(cwd, paths.git, ["add", "-A", "--", "."]);
    const tree = (await this.snapshotGit(cwd, paths.git, ["write-tree"])).trim();
    const checkpointId = randomUUID();
    const record: CheckpointRecord = { version: 1, checkpointId, tree };
    const temporary = `${paths.record}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, `${JSON.stringify(record)}\n`, { mode: 0o600 });
      await rename(temporary, paths.record);
    } finally {
      await rm(temporary, { force: true });
    }
  }

  diff(sessionId: SessionId, cwd: string, scope: WorkspaceDiffScope): Promise<WorkspaceDiff> {
    return this.serialized(sessionId, () => this.diffUnlocked(sessionId, cwd, scope));
  }

  private async diffUnlocked(
    sessionId: SessionId,
    cwd: string,
    scope: WorkspaceDiffScope,
  ): Promise<WorkspaceDiff> {
    await this.assertGitWorkspace(cwd);
    if (scope === "working") {
      return this.boundWireResponse({ scope, files: await this.workingDiff(cwd) });
    }

    const paths = this.paths(sessionId);
    let stored: unknown;
    try {
      stored = JSON.parse(await readFile(paths.record, "utf8")) as unknown;
    } catch (cause) {
      throw new WorkspaceCheckpointError(
        "checkpoint_unavailable",
        "No completed prompt checkpoint is available for this session",
        { cause },
      );
    }
    if (
      typeof stored !== "object" ||
      stored === null ||
      (stored as Partial<CheckpointRecord>).version !== 1 ||
      typeof (stored as Partial<CheckpointRecord>).tree !== "string" ||
      !/^[0-9a-f]{40,64}$/u.test((stored as Partial<CheckpointRecord>).tree as string) ||
      typeof (stored as Partial<CheckpointRecord>).checkpointId !== "string" ||
      !/^[0-9a-f-]{36}$/u.test((stored as Partial<CheckpointRecord>).checkpointId as string)
    ) {
      throw new WorkspaceCheckpointError(
        "checkpoint_corrupt",
        "The last-turn checkpoint is invalid",
      );
    }
    const record = stored as CheckpointRecord;
    await this.assertBoundedWorkspace(cwd);
    await this.snapshotGit(cwd, paths.git, ["add", "-A", "--", "."]);
    const current = (await this.snapshotGit(cwd, paths.git, ["write-tree"])).trim();
    return this.boundWireResponse({
      scope,
      checkpointId: record.checkpointId,
      files: await this.diffTrees(cwd, paths.git, record.tree, current),
    });
  }

  private boundWireResponse(diff: WorkspaceDiff): WorkspaceDiff {
    if (Buffer.byteLength(JSON.stringify(diff)) > 900 * 1024) {
      throw new WorkspaceCheckpointError(
        "workspace_diff_too_large",
        "Encoded workspace review exceeds the daemon wire budget",
      );
    }
    return diff;
  }

  private async serialized<Result>(
    sessionId: SessionId,
    operation: () => Promise<Result>,
  ): Promise<Result> {
    const previous = this.operations.get(sessionId) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(operation);
    this.operations.set(sessionId, current);
    try {
      return await current;
    } finally {
      if (this.operations.get(sessionId) === current) this.operations.delete(sessionId);
    }
  }

  private paths(sessionId: SessionId): { root: string; git: string; record: string } {
    const root = join(this.directory, "checkpoints", sessionId);
    return { root, git: join(root, "git"), record: join(root, "last-turn.json") };
  }

  private async assertGitWorkspace(cwd: string): Promise<void> {
    try {
      const result = (await this.git(cwd, ["rev-parse", "--is-inside-work-tree"])).trim();
      if (result !== "true") throw new Error("not a work tree");
    } catch (cause) {
      throw new WorkspaceCheckpointError(
        "workspace_diff_unavailable",
        "Workspace review requires a Git worktree",
        { cause },
      );
    }
  }

  private async assertBoundedWorkspace(cwd: string): Promise<void> {
    const files = splitNul(
      await this.git(cwd, [
        "ls-files",
        "-z",
        "--cached",
        "--others",
        "--exclude-standard",
        "--",
        ".",
      ]),
    );
    if (files.length > 20_000) {
      throw new WorkspaceCheckpointError(
        "checkpoint_too_large",
        "Workspace checkpoint exceeds the 20,000 file safety limit",
      );
    }
    let bytes = 0;
    for (const path of files) {
      let info: Stats;
      try {
        info = await lstat(join(cwd, path));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
        throw error;
      }
      if (!info.isFile()) continue;
      bytes += info.size;
      if (bytes > WORKSPACE_BYTE_LIMIT) {
        throw new WorkspaceCheckpointError(
          "checkpoint_too_large",
          "Workspace checkpoint exceeds the 256 MiB safety limit",
        );
      }
    }
  }

  private async workingDiff(cwd: string): Promise<WorkspaceFileDiff[]> {
    const tracked = await this.diffAgainst(cwd, [], ["HEAD"]);
    const known = new Set(tracked.map((file) => file.path));
    const untracked = splitNul(
      await this.git(cwd, ["ls-files", "-z", "--others", "--exclude-standard", "--", "."]),
    );
    for (const path of untracked) {
      if (known.has(path)) continue;
      let patch = await this.git(
        cwd,
        ["diff", "--no-ext-diff", "--no-textconv", "--no-index", "--", "/dev/null", path],
        true,
      );
      const counts = parseNumstat(
        await this.git(
          cwd,
          [
            "diff",
            "--no-ext-diff",
            "--no-textconv",
            "--no-index",
            "--numstat",
            "--",
            "/dev/null",
            path,
          ],
          true,
        ),
      );
      let truncated = false;
      if (Buffer.byteLength(patch) > PATCH_LIMIT) {
        patch = Buffer.from(patch).subarray(0, PATCH_LIMIT).toString("utf8");
        truncated = true;
      }
      tracked.push({ path, status: "added", ...counts, patch, truncated });
    }
    return this.boundResponse(
      tracked.toSorted((left, right) => left.path.localeCompare(right.path)),
    );
  }

  private async diffTrees(
    cwd: string,
    gitDirectory: string,
    from: string,
    to: string,
  ): Promise<WorkspaceFileDiff[]> {
    return this.diffAgainst(cwd, [`--git-dir=${gitDirectory}`, `--work-tree=${cwd}`], [from, to]);
  }

  private async diffAgainst(
    cwd: string,
    gitContext: readonly string[],
    refs: readonly string[],
  ): Promise<WorkspaceFileDiff[]> {
    const status = splitNul(
      await this.git(cwd, [
        ...gitContext,
        "diff",
        "--no-ext-diff",
        "--no-textconv",
        "--no-renames",
        "--name-status",
        "-z",
        ...refs,
        "--",
        ".",
      ]),
    );
    const files: WorkspaceFileDiff[] = [];
    for (let index = 0; index < status.length; index += 2) {
      if (files.length >= FILE_LIMIT) {
        throw new WorkspaceCheckpointError(
          "workspace_diff_too_large",
          `Workspace review exceeds the ${FILE_LIMIT} file limit`,
        );
      }
      const code = status[index];
      const path = status[index + 1];
      if (!code || !path) continue;
      const patchArgs = [
        ...gitContext,
        "diff",
        "--no-ext-diff",
        "--no-textconv",
        "--no-renames",
        ...refs,
        "--",
        path,
      ];
      let patch = await this.git(cwd, patchArgs);
      const counts = parseNumstat(
        await this.git(cwd, [
          ...gitContext,
          "diff",
          "--no-ext-diff",
          "--no-textconv",
          "--no-renames",
          "--numstat",
          ...refs,
          "--",
          path,
        ]),
      );
      let truncated = false;
      if (Buffer.byteLength(patch) > PATCH_LIMIT) {
        patch = Buffer.from(patch).subarray(0, PATCH_LIMIT).toString("utf8");
        truncated = true;
      }
      files.push({ path, status: statusName(code), ...counts, patch, truncated });
    }
    return this.boundResponse(files);
  }

  private boundResponse(files: WorkspaceFileDiff[]): WorkspaceFileDiff[] {
    if (files.reduce((total, file) => total + Buffer.byteLength(file.patch), 0) > RESPONSE_LIMIT) {
      throw new WorkspaceCheckpointError(
        "workspace_diff_too_large",
        "Workspace review exceeds the 128 KiB response patch budget",
      );
    }
    return files;
  }

  private async snapshotGit(
    cwd: string,
    gitDirectory: string,
    args: readonly string[],
  ): Promise<string> {
    return this.git(cwd, [`--git-dir=${gitDirectory}`, `--work-tree=${cwd}`, ...args]);
  }

  private async git(
    cwd: string,
    args: readonly string[],
    allowDifference = false,
  ): Promise<string> {
    try {
      const result = await execute("git", args, {
        cwd,
        encoding: "utf8",
        maxBuffer: 2 * 1024 * 1024,
        env: isolatedGitEnvironment(),
      });
      return result.stdout;
    } catch (cause) {
      const error = cause as {
        readonly stdout?: string;
        readonly stderr?: string;
        readonly message?: string;
        readonly code?: unknown;
      };
      if (allowDifference && error.code === 1 && error.stdout !== undefined) return error.stdout;
      throw new WorkspaceCheckpointError(
        "workspace_diff_failed",
        (error.stderr ?? error.message ?? "Git workspace operation failed").trim(),
        { cause },
      );
    }
  }
}
