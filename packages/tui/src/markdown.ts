// SPDX-FileCopyrightText: 2026 Hari Srinivasan
// SPDX-License-Identifier: Apache-2.0

// Compact terminal markdown renderer for assistant output: headings, fenced
// code blocks, inline code, bold/italic, lists, and blockquotes. Plain
// paragraphs pass through untouched so transcripts stay greppable.

import { highlightLine } from "./highlight.ts";
import { wrapLine } from "./render.ts";
import type { Palette } from "./transcript.ts";

const BOLD = (text: string): string => `\x1b[1m${text}\x1b[22m`;
const ITALIC = (text: string): string => `\x1b[3m${text}\x1b[23m`;

/** Renders inline markdown spans: `code`, **bold**, *italic*. */
export function renderInline(text: string, palette: Palette): string {
  let out = "";
  let index = 0;
  while (index < text.length) {
    const rest = text.slice(index);
    const code = /^`([^`]+)`/.exec(rest);
    if (code !== null) {
      out += (palette.mdCode ?? palette.accent)(code[1] as string);
      index += code[0].length;
      continue;
    }
    const bold = /^\*\*([^*]+)\*\*/.exec(rest);
    if (bold !== null) {
      out += BOLD(bold[1] as string);
      index += bold[0].length;
      continue;
    }
    const italic = /^\*([^*]+)\*/.exec(rest);
    if (italic !== null) {
      out += ITALIC(italic[1] as string);
      index += italic[0].length;
      continue;
    }
    out += text[index];
    index += 1;
  }
  return out;
}

/** Renders markdown text to styled, hard-wrapped terminal lines. */
export function renderMarkdown(text: string, width: number, palette: Palette): string[] {
  const out: string[] = [];
  const wrap = (line: string): string[] => wrapLine(line, width);
  let inFence = false;
  let fenceLanguage = "";

  for (const raw of text.split("\n")) {
    const fence = /^\s*```\s*(\S*)/.exec(raw);
    if (fence !== null) {
      inFence = !inFence;
      fenceLanguage = inFence ? ((fence[1] as string) ?? "") : "";
      out.push(
        (palette.mdCodeBlockBorder ?? palette.dim)(
          inFence && fenceLanguage.length > 0 ? `╭─ ${fenceLanguage}` : inFence ? "╭─" : "╰─",
        ),
      );
      continue;
    }
    if (inFence) {
      // Code is preserved verbatim behind a gutter, syntax-highlighted where known.
      out.push(
        ...wrap(
          `${(palette.mdCodeBlockBorder ?? palette.dim)("│")} ${highlightLine(raw, fenceLanguage, palette)}`,
        ),
      );
      continue;
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(raw);
    if (heading !== null) {
      out.push(...wrap(BOLD((palette.mdHeading ?? palette.accent)(heading[2] as string))));
      continue;
    }
    const bullet = /^(\s*)[-*]\s+(.*)$/.exec(raw);
    if (bullet !== null) {
      out.push(
        ...wrap(
          `${bullet[1]}${(palette.mdListBullet ?? palette.accent)("•")} ${renderInline(
            bullet[2] as string,
            palette,
          )}`,
        ),
      );
      continue;
    }
    const quote = /^>\s?(.*)$/.exec(raw);
    if (quote !== null) {
      out.push(
        ...wrap(
          `${(palette.mdQuoteBorder ?? palette.accent)("▌")} ${(palette.mdQuote ?? palette.dim)(
            renderInline(quote[1] as string, palette),
          )}`,
        ),
      );
      continue;
    }
    out.push(...wrap(renderInline(raw, palette)));
  }
  // A dangling fence still closes visually.
  if (inFence) out.push((palette.mdCodeBlockBorder ?? palette.dim)("╰─"));
  return out;
}
