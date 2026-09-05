// SPDX-FileCopyrightText: 2026 Hari Srinivasan
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { MAX_ATTACHMENT_BYTES, readClipboard, saveClipboardImage } from "../src/index.ts";

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
  "base64",
);

test("clipboard images use unique private temp files and validate before writing", async (context) => {
  const first = await saveClipboardImage(png);
  const second = await saveClipboardImage(png);
  context.after(async () => {
    await rm(first);
    await rm(second);
  });
  assert.notEqual(first, second);
  assert.match(first, /axl-clipboard-[a-f0-9-]+\.png$/u);
  assert.deepEqual(await readFile(first), png);
  if (process.platform !== "win32") assert.equal((await stat(first)).mode & 0o777, 0o600);
  await assert.rejects(saveClipboardImage(Buffer.alloc(0)), /empty/);
  await assert.rejects(saveClipboardImage(Buffer.from("not an image")), /Only PNG/);
  await assert.rejects(saveClipboardImage(Buffer.alloc(MAX_ATTACHMENT_BYTES + 1)), /exceeds/);
});

test(
  "Linux clipboard readers distinguish images, text, unsupported formats, and backend failure",
  { skip: process.platform !== "linux" ? "Linux clipboard command integration" : false },
  async (context) => {
    const directory = await mkdtemp(join(tmpdir(), "axl-clipboard-test-"));
    const keys = [
      "PATH",
      "WAYLAND_DISPLAY",
      "DISPLAY",
      "XDG_SESSION_TYPE",
      "WSL_DISTRO_NAME",
      "AXL_CLIPBOARD_TEST",
    ] as const;
    const before = new Map(keys.map((key) => [key, process.env[key]]));
    const created: string[] = [];
    context.after(async () => {
      for (const [key, value] of before) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      for (const path of created) await rm(path);
      await rm(directory, { recursive: true });
    });
    const script = `#!${process.execPath}
const mode = process.env.AXL_CLIPBOARD_TEST;
const args = process.argv.slice(2);
if (mode === 'failure') process.exit(1);
if (args.includes('--list-types') || args.includes('TARGETS')) {
  process.stdout.write(mode === 'unsupported' ? 'image/tiff\\n' : mode === 'text' ? 'text/plain\\n' : 'image/png\\ntext/plain\\n');
} else if (args.includes('image/png')) {
  process.stdout.write(mode === 'invalid' ? Buffer.from('not an image') : Buffer.from('${png.toString("base64")}', 'base64'));
} else {
  process.stdout.write('first\\r\\nsecond');
}
`;
    await writeFile(join(directory, "wl-paste"), script, { mode: 0o700 });
    await writeFile(join(directory, "xclip"), script, { mode: 0o700 });
    process.env.PATH = directory;
    delete process.env.WSL_DISTRO_NAME;
    for (const session of ["wayland", "x11"]) {
      process.env.XDG_SESSION_TYPE = session;
      process.env.DISPLAY = ":fixture";
      if (session === "wayland") process.env.WAYLAND_DISPLAY = "fixture";
      else delete process.env.WAYLAND_DISPLAY;
      process.env.AXL_CLIPBOARD_TEST = "image";
      const image = await readClipboard();
      assert.notEqual(typeof image, "string");
      if (typeof image === "string") throw new Error("Expected an image path");
      created.push(image.imagePath);
      assert.deepEqual(await readFile(image.imagePath), png);
      process.env.AXL_CLIPBOARD_TEST = "text";
      assert.equal(await readClipboard(), "first\nsecond");
      process.env.AXL_CLIPBOARD_TEST = "unsupported";
      await assert.rejects(readClipboard(), /Unsupported clipboard image format/);
      process.env.AXL_CLIPBOARD_TEST = "invalid";
      await assert.rejects(readClipboard(), /Only PNG/);
      process.env.AXL_CLIPBOARD_TEST = "failure";
      await assert.rejects(readClipboard(), /Clipboard read failed/);
    }
  },
);
