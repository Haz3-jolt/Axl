// SPDX-FileCopyrightText: 2026 Hari Srinivasan
// SPDX-FileCopyrightText: 2026 Kaushik Kumar
// SPDX-License-Identifier: Apache-2.0

import { execFile, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { open, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { imageAttachment, MAX_ATTACHMENT_BYTES } from "./attachments.ts";

const execute = promisify(execFile);
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

// Independently implements Pi's clipboard-to-path interaction, with Axl-owned blob delivery.
// Reference: https://github.com/earendil-works/pi/blob/6c87d9a026677b601e8278030dcf1ad97fe0bd86/packages/coding-agent/src/modes/interactive/interactive-mode.ts
/** Images have a user-visible local path; submission still uses the daemon blob channel. */
export type ClipboardContent = string | { readonly imagePath: string };

function powershell(): string {
  return process.platform === "win32"
    ? "powershell.exe"
    : "/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe";
}

function linuxClipboard(): "wayland" | "x11" {
  if (process.env.WAYLAND_DISPLAY || process.env.XDG_SESSION_TYPE === "wayland") return "wayland";
  if (process.env.DISPLAY) return "x11";
  throw new Error("Clipboard unavailable: no Wayland or X11 display");
}

async function clipboardBytes(
  file: string,
  args: string[],
  maxBuffer = MAX_ATTACHMENT_BYTES,
): Promise<Buffer> {
  try {
    const { stdout } = await execute(file, args, { encoding: "buffer", timeout: 5_000, maxBuffer });
    return stdout;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    throw new Error(`Clipboard read failed (${file}${code === undefined ? "" : `: ${code}`})`, {
      cause: error,
    });
  }
}

async function readClipboardImage(): Promise<Buffer | undefined> {
  if (process.platform === "win32" || process.env.WSL_DISTRO_NAME) {
    const script = [
      "$ErrorActionPreference = 'Stop'",
      "Add-Type -AssemblyName System.Windows.Forms",
      "Add-Type -AssemblyName System.Drawing",
      "if ([System.Windows.Forms.Clipboard]::ContainsImage()) {",
      "$image = [System.Windows.Forms.Clipboard]::GetImage(); $stream = [System.IO.MemoryStream]::new()",
      "try { $image.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png); [Convert]::ToBase64String($stream.ToArray()) } finally { $stream.Dispose(); $image.Dispose() }",
      "}",
    ].join("\n");
    const encoded = await clipboardBytes(
      powershell(),
      ["-NoProfile", "-NonInteractive", "-STA", "-Command", script],
      Math.ceil((MAX_ATTACHMENT_BYTES * 4) / 3) + 1024,
    );
    return encoded.toString("utf8").trim()
      ? Buffer.from(encoded.toString("utf8").trim(), "base64")
      : undefined;
  }
  if (process.platform === "darwin") {
    const script = `ObjC.import('AppKit');
function run() {
  const image = $.NSImage.alloc.initWithPasteboard($.NSPasteboard.generalPasteboard);
  if (image.isNil()) return '';
  const bitmap = $.NSBitmapImageRep.imageRepWithData(image.TIFFRepresentation);
  if (bitmap.isNil()) throw new Error('Cannot decode clipboard image');
  const png = bitmap.representationUsingTypeProperties($.NSBitmapImageFileTypePNG, $.NSDictionary.dictionary);
  if (png.isNil()) throw new Error('Cannot encode clipboard image as PNG');
  return ObjC.unwrap(png.base64EncodedStringWithOptions(0));
}`;
    const encoded = await clipboardBytes(
      "osascript",
      ["-l", "JavaScript", "-e", script],
      Math.ceil((MAX_ATTACHMENT_BYTES * 4) / 3) + 1024,
    );
    return encoded.toString("utf8").trim()
      ? Buffer.from(encoded.toString("utf8").trim(), "base64")
      : undefined;
  }
  const wayland = linuxClipboard() === "wayland";
  const file = wayland ? "wl-paste" : "xclip";
  const selection = ["-selection", "clipboard", "-o"];
  const types = (
    await clipboardBytes(
      file,
      wayland ? ["--list-types"] : [...selection, "-t", "TARGETS"],
      64 * 1024,
    )
  )
    .toString("utf8")
    .split(/\r?\n/u)
    .map((type) => type.trim())
    .filter(Boolean);
  const type = IMAGE_TYPES.map((mime) =>
    types.find((candidate) => candidate.split(";")[0]?.toLowerCase() === mime),
  ).find(Boolean);
  if (type === undefined) {
    if (types.some((candidate) => candidate.toLowerCase().startsWith("image/"))) {
      throw new Error("Unsupported clipboard image format; copy a PNG, JPEG, GIF, or WebP image");
    }
    return undefined;
  }
  return clipboardBytes(
    file,
    wayland ? ["--type", type, "--no-newline"] : [...selection, "-t", type],
  );
}

/** Validates before writing, and never overwrites an existing file or follows its symlink. */
export async function saveClipboardImage(bytes: Uint8Array): Promise<string> {
  const image = imageAttachment(bytes, "clipboard");
  const extension =
    image.mediaType === "image/jpeg" ? "jpg" : image.mediaType.slice("image/".length);
  const path = join(tmpdir(), `axl-clipboard-${randomUUID()}.${extension}`);
  const handle = await open(path, "wx", 0o600);
  try {
    try {
      await handle.writeFile(bytes);
    } finally {
      await handle.close();
    }
  } catch (error) {
    await unlink(path);
    throw error;
  }
  return path;
}

export async function readClipboard(): Promise<ClipboardContent> {
  const bytes = await readClipboardImage();
  if (bytes === undefined) return readClipboardText();
  return { imagePath: await saveClipboardImage(bytes) };
}

function commandForRead(): { file: string; args: string[] } {
  if (process.platform === "darwin") return { file: "pbpaste", args: [] };
  if (process.platform === "win32" || process.env.WSL_DISTRO_NAME) {
    return {
      file: powershell(),
      args: [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "[Console]::OutputEncoding=[Text.UTF8Encoding]::new(); Get-Clipboard -Raw",
      ],
    };
  }
  return linuxClipboard() === "wayland"
    ? { file: "wl-paste", args: ["--type", "text", "--no-newline"] }
    : { file: "xclip", args: ["-selection", "clipboard", "-o"] };
}

function commandForWrite(): { file: string; args: string[] } {
  if (process.platform === "darwin") return { file: "pbcopy", args: [] };
  if (process.platform === "win32" || process.env.WSL_DISTRO_NAME) {
    return { file: "clip.exe", args: [] };
  }
  return { file: "wl-copy", args: [] };
}

export function readClipboardText(): Promise<string> {
  const command = commandForRead();
  return new Promise((resolve, reject) => {
    execFile(
      command.file,
      command.args,
      { encoding: "utf8", maxBuffer: 10 * 1024 * 1024, timeout: 5_000 },
      (error, stdout) => {
        if (error) {
          reject(new Error(`Clipboard read failed: ${error.message}`, { cause: error }));
          return;
        }
        resolve(stdout.replace(/\r\n/g, "\n").replace(/\r/g, "\n"));
      },
    );
  });
}

export function writeClipboardText(text: string): Promise<void> {
  const command = commandForWrite();
  return new Promise((resolve, reject) => {
    const child = spawn(command.file, command.args, { stdio: ["pipe", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.once("error", (error) => {
      reject(new Error(`Clipboard write failed: ${error.message}`, { cause: error }));
    });
    child.stdin.once("error", (error) => {
      reject(new Error(`Clipboard write failed: ${error.message}`, { cause: error }));
    });
    child.once("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Clipboard write failed with exit code ${code}: ${stderr.trim()}`));
    });
    child.stdin.end(text);
  });
}
