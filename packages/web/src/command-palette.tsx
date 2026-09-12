// SPDX-FileCopyrightText: 2026 Hari Srinivasan
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useMemo, useRef, useState, type JSX } from "react";
import type { EffectiveCommand } from "@axl/sdk";

import { filterCommands } from "./commands.ts";

export function CommandPalette({
  commands,
  open,
  onClose,
  onSelect,
}: {
  readonly commands: readonly EffectiveCommand[];
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onSelect: (command: EffectiveCommand) => void;
}): JSX.Element | null {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const visible = useMemo(() => filterCommands(commands, query), [commands, query]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActive(0);
    queueMicrotask(() => input.current?.focus());
  }, [open]);

  if (!open) return null;
  const choose = (command: EffectiveCommand | undefined): void => {
    if (command === undefined || command.availability.state === "unavailable") return;
    onSelect(command);
  };
  return (
    <div className="command-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="command-palette" role="dialog" aria-modal="true" aria-label="Commands">
        <input
          ref={input}
          type="search"
          aria-label="Search commands"
          placeholder="Search commands"
          value={query}
          onChange={(event) => { setQuery(event.target.value); setActive(0); }}
          onKeyDown={(event) => {
            if (event.key === "Escape") onClose();
            else if (event.key === "ArrowDown") { event.preventDefault(); setActive((current) => Math.min(current + 1, visible.length - 1)); }
            else if (event.key === "ArrowUp") { event.preventDefault(); setActive((current) => Math.max(current - 1, 0)); }
            else if (event.key === "Enter") { event.preventDefault(); choose(visible[active]); }
          }}
        />
        <div className="command-list" role="listbox" aria-label="Available commands">
          {visible.length === 0 && <p>No matching commands</p>}
          {visible.map((command, index) => (
            <button
              key={command.id}
              type="button"
              role="option"
              aria-selected={index === active}
              disabled={command.availability.state === "unavailable"}
              className={index === active ? "active" : ""}
              onMouseEnter={() => setActive(index)}
              onClick={() => choose(command)}
            >
              <span><strong>/{command.name}</strong>{command.argument.hint && <code>{command.argument.hint}</code>}</span>
              <small>{command.availability.state === "unavailable" ? command.availability.reason : command.description}</small>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
