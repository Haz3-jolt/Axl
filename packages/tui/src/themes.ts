// SPDX-FileCopyrightText: 2026 Hari Srinivasan
// SPDX-License-Identifier: Apache-2.0

import type { Palette } from "./transcript.ts";

function sgr(open: string, close: string): (text: string) => string {
  return (text) => `\x1b[${open}m${text}\x1b[${close}m`;
}

function fg256(color: number): (text: string) => string {
  return (text) => `\x1b[38;5;${color}m${text}\x1b[39m`;
}

function rgb(hex: string): string {
  const value = Number.parseInt(hex.slice(1), 16);
  return `${(value >> 16) & 255};${(value >> 8) & 255};${value & 255}`;
}

function foreground(hex: string): (text: string) => string {
  const color = rgb(hex);
  return (text) => `\x1b[38;2;${color}m${text}\x1b[39m`;
}

function background(hex: string): (text: string) => string {
  const color = rgb(hex);
  return (text) => `\x1b[48;2;${color}m${text}\x1b[49m`;
}

function foregroundOn(fg: string, bg: string): (text: string) => string {
  const foregroundColor = rgb(fg);
  const backgroundColor = rgb(bg);
  return (text) => `\x1b[38;2;${foregroundColor};48;2;${backgroundColor}m${text}\x1b[39;49m`;
}

const bold = sgr("1", "22");

const kepler: Palette = {
  dim: sgr("2", "22"),
  accent: sgr("36", "39"),
  error: sgr("31", "39"),
  bold,
  border: sgr("90", "39"),
  success: sgr("32", "39"),
  warning: sgr("33", "39"),
  diffAdded: sgr("32", "39"),
  diffRemoved: sgr("31", "39"),
  diffContext: sgr("2", "22"),
  thinking: (_level, text) => sgr("36", "39")(text),
  keyword: fg256(175),
  literal: fg256(114),
};

const ember: Palette = {
  dim: fg256(243),
  accent: fg256(214),
  error: fg256(203),
  bold,
  border: fg256(243),
  success: fg256(114),
  warning: fg256(220),
  diffAdded: fg256(114),
  diffRemoved: fg256(203),
  diffContext: fg256(243),
  thinking: (_level, text) => fg256(214)(text),
  keyword: fg256(209),
  literal: fg256(179),
};

const ocean: Palette = {
  dim: fg256(245),
  accent: fg256(75),
  error: fg256(210),
  bold,
  border: fg256(245),
  success: fg256(79),
  warning: fg256(221),
  diffAdded: fg256(79),
  diffRemoved: fg256(210),
  diffContext: fg256(245),
  thinking: (_level, text) => fg256(75)(text),
  keyword: fg256(111),
  literal: fg256(79),
};

const grove: Palette = {
  dim: fg256(244),
  accent: fg256(142),
  error: fg256(167),
  bold,
  border: fg256(244),
  success: fg256(108),
  warning: fg256(180),
  diffAdded: fg256(108),
  diffRemoved: fg256(167),
  diffContext: fg256(244),
  thinking: (_level, text) => fg256(142)(text),
  keyword: fg256(108),
  literal: fg256(180),
};

const gruvbox = {
  bg0Hard: "#1d2021",
  bg1: "#3c3836",
  bg3: "#665c54",
  bg4: "#7c6f64",
  gray: "#928374",
  fg1: "#ebdbb2",
  fg3: "#bdae93",
  fg4: "#a89984",
  red: "#fb4934",
  green: "#b8bb26",
  yellow: "#fabd2f",
  blue: "#83a598",
  aqua: "#8ec07c",
  orange: "#fe8019",
} as const;

const dark: Palette = {
  dim: foreground(gruvbox.gray),
  accent: foreground(gruvbox.orange),
  error: foreground(gruvbox.red),
  bold,
  border: foreground(gruvbox.bg4),
  success: foreground(gruvbox.green),
  warning: foreground(gruvbox.yellow),
  text: foreground(gruvbox.fg1),
  userMessage: foregroundOn(gruvbox.fg1, gruvbox.bg0Hard),
  toolBackground: background("#202324"),
  diffAdded: foreground(gruvbox.green),
  diffRemoved: foreground(gruvbox.red),
  diffContext: foreground(gruvbox.gray),
  diffAddedBackground: background("#24332b"),
  diffRemovedBackground: background("#35282c"),
  mdHeading: foreground(gruvbox.yellow),
  mdCode: foreground(gruvbox.aqua),
  mdCodeBlockBorder: foreground(gruvbox.bg4),
  mdQuote: foreground(gruvbox.fg3),
  mdQuoteBorder: foreground(gruvbox.orange),
  mdListBullet: foreground(gruvbox.orange),
  thinking: (level, text) => {
    const colors: Readonly<Record<string, string>> = {
      off: gruvbox.bg3,
      minimal: gruvbox.fg4,
      low: gruvbox.orange,
      medium: gruvbox.yellow,
      high: gruvbox.orange,
      xhigh: gruvbox.red,
      max: gruvbox.red,
    };
    return foreground(colors[level] ?? gruvbox.bg4)(text);
  },
  keyword: foreground(gruvbox.red),
  literal: foreground(gruvbox.yellow),
};

const plain: Palette = {
  dim: (text) => text,
  accent: (text) => text,
  error: (text) => text,
  bold: (text) => text,
};

export const THEMES: Readonly<Record<string, Palette>> = {
  dark,
  kepler,
  ember,
  ocean,
  grove,
  plain,
};

export const DEFAULT_THEME = "dark";

export function themeNames(): readonly string[] {
  return Object.keys(THEMES);
}
