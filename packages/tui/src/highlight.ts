// SPDX-FileCopyrightText: 2026 Hari Srinivasan
// SPDX-License-Identifier: Apache-2.0

// Small line-based syntax highlighter for fenced code blocks: comments,
// strings, numbers, and keywords for the common language families. Anything
// unrecognized passes through untouched.

import type { Palette } from "./transcript.ts";

const KEYWORDS: Readonly<Record<string, readonly string[]>> = {
  javascript: [
    "async",
    "await",
    "break",
    "case",
    "catch",
    "class",
    "const",
    "continue",
    "default",
    "delete",
    "do",
    "else",
    "export",
    "extends",
    "finally",
    "for",
    "function",
    "if",
    "import",
    "in",
    "instanceof",
    "interface",
    "let",
    "new",
    "of",
    "return",
    "static",
    "switch",
    "throw",
    "try",
    "type",
    "typeof",
    "var",
    "while",
    "yield",
    "true",
    "false",
    "null",
    "undefined",
  ],
  python: [
    "and",
    "as",
    "assert",
    "async",
    "await",
    "break",
    "class",
    "continue",
    "def",
    "del",
    "elif",
    "else",
    "except",
    "finally",
    "for",
    "from",
    "global",
    "if",
    "import",
    "in",
    "is",
    "lambda",
    "not",
    "or",
    "pass",
    "raise",
    "return",
    "try",
    "while",
    "with",
    "yield",
    "True",
    "False",
    "None",
  ],
  shell: [
    "if",
    "then",
    "else",
    "elif",
    "fi",
    "for",
    "while",
    "do",
    "done",
    "case",
    "esac",
    "function",
    "return",
    "exit",
    "export",
    "local",
    "echo",
    "cd",
    "set",
  ],
  rust: [
    "as",
    "break",
    "const",
    "continue",
    "crate",
    "else",
    "enum",
    "fn",
    "for",
    "if",
    "impl",
    "in",
    "let",
    "loop",
    "match",
    "mod",
    "move",
    "mut",
    "pub",
    "ref",
    "return",
    "self",
    "static",
    "struct",
    "trait",
    "type",
    "use",
    "where",
    "while",
    "true",
    "false",
  ],
  go: [
    "break",
    "case",
    "chan",
    "const",
    "continue",
    "default",
    "defer",
    "else",
    "for",
    "func",
    "go",
    "if",
    "import",
    "interface",
    "map",
    "package",
    "range",
    "return",
    "select",
    "struct",
    "switch",
    "type",
    "var",
    "true",
    "false",
    "nil",
  ],
};

const LANGUAGE_ALIASES: Readonly<Record<string, string>> = {
  js: "javascript",
  jsx: "javascript",
  ts: "javascript",
  tsx: "javascript",
  typescript: "javascript",
  json: "javascript",
  py: "python",
  bash: "shell",
  sh: "shell",
  zsh: "shell",
  rs: "rust",
  golang: "go",
};

const COMMENT_STARTS: Readonly<Record<string, string>> = {
  javascript: "//",
  python: "#",
  shell: "#",
  rust: "//",
  go: "//",
};

/** Highlights one line of code for the given fence language tag. */
export function highlightLine(line: string, language: string, palette: Palette): string {
  const family =
    KEYWORDS[language] !== undefined ? language : LANGUAGE_ALIASES[language.toLowerCase()];
  if (family === undefined) return line;
  const keyword = palette.keyword ?? palette.accent;
  const literal = palette.literal ?? palette.dim;
  const keywords = new Set(KEYWORDS[family]);
  const commentStart = COMMENT_STARTS[family] as string;

  let out = "";
  let index = 0;
  while (index < line.length) {
    const rest = line.slice(index);
    if (rest.startsWith(commentStart)) {
      out += palette.dim(rest);
      break;
    }
    const string = /^(["'`])(?:\\.|(?!\1).)*\1?/.exec(rest);
    if (string !== null) {
      out += literal(string[0]);
      index += string[0].length;
      continue;
    }
    const number = /^\d[\d._]*/.exec(rest);
    if (number !== null) {
      out += literal(number[0]);
      index += number[0].length;
      continue;
    }
    const word = /^[A-Za-z_][A-Za-z0-9_]*/.exec(rest);
    if (word !== null) {
      out += keywords.has(word[0]) ? keyword(word[0]) : word[0];
      index += word[0].length;
      continue;
    }
    out += line[index];
    index += 1;
  }
  return out;
}
