// SPDX-FileCopyrightText: 2026 Hari Srinivasan
// SPDX-License-Identifier: Apache-2.0

import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

function git(repository: string, ...arguments_: string[]): string {
  return execFileSync("git", ["-C", repository, ...arguments_], { encoding: "utf8" }).trim();
}

function escapeRegularExpression(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function checkDco(repository: string, base: string, head: string): string[] {
  const range = /^0+$/.test(base) ? head : `${base}..${head}`;
  const commits = git(repository, "rev-list", "--reverse", range).split("\n").filter(Boolean);
  const errors: string[] = [];

  for (const commit of commits) {
    const parents = git(repository, "show", "-s", "--format=%P", commit).split(" ").filter(Boolean);
    if (parents.length > 1) continue;

    const details = git(repository, "show", "-s", "--format=%an%x00%ae%x00%B", commit);
    const [name = "", email = "", body = ""] = details.split("\0", 3);
    const signoff = new RegExp(
      `^Signed-off-by:\\s*${escapeRegularExpression(name)}\\s*<${escapeRegularExpression(email)}>\\s*$`,
      "im",
    );
    if (!signoff.test(body)) errors.push(`${commit} is missing Signed-off-by: ${name} <${email}>`);
  }

  return errors;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  const [base, head] = process.argv.slice(2);
  if (!base || !head) {
    console.error("Usage: node scripts/check-dco.ts <base-sha> <head-sha>");
    process.exitCode = 2;
  } else {
    const errors = checkDco(process.cwd(), base, head);
    if (errors.length > 0) {
      console.error(errors.join("\n"));
      process.exitCode = 1;
    } else {
      console.log("All commits have matching DCO sign-offs.");
    }
  }
}
