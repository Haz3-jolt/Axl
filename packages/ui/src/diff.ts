// SPDX-FileCopyrightText: 2026 Hari Srinivasan
// SPDX-License-Identifier: Apache-2.0

import type { JsonObject } from "@axl/sdk";

export interface DiffRow {
  readonly kind: "meta" | "remove" | "add";
  readonly text: string;
  readonly oldLine?: number;
  readonly newLine?: number;
}

export function editDiffRows(input: JsonObject): readonly DiffRow[] {
  const edits = Array.isArray(input.edits) ? input.edits : [];
  const rows: DiffRow[] = [];
  for (const [index, candidate] of edits.entries()) {
    if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate)) continue;
    const oldText =
      "oldText" in candidate && typeof candidate.oldText === "string" ? candidate.oldText : "";
    const newText =
      "newText" in candidate && typeof candidate.newText === "string" ? candidate.newText : "";
    rows.push({ kind: "meta", text: `@@ replacement ${index + 1} @@` });
    for (const [line, text] of oldText.split("\n").entries())
      rows.push({ kind: "remove", text, oldLine: line + 1 });
    for (const [line, text] of newText.split("\n").entries())
      rows.push({ kind: "add", text, newLine: line + 1 });
  }
  return rows;
}
