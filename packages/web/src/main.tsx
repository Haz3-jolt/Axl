// SPDX-FileCopyrightText: 2026 Hari Srinivasan
// SPDX-License-Identifier: Apache-2.0

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "@axl/ui/theme.css";
import "@axl/ui/conversation.css";
import { AxlApp, type WebPreview } from "./app.tsx";
import "./styles.css";

const root = document.getElementById("root");
if (root === null) throw new Error("Missing Axl application root");
let preview: WebPreview | undefined;
if (import.meta.env.DEV && new URLSearchParams(location.search).get("preview") === "tools") {
  const load = import.meta.glob<{ readonly preview: WebPreview }>("./preview.local.ts")[
    "./preview.local.ts"
  ];
  if (load === undefined) throw new Error("Local web preview fixture is unavailable");
  preview = (await load()).preview;
}
createRoot(root).render(
  <StrictMode>{preview === undefined ? <AxlApp /> : <AxlApp preview={preview} />}</StrictMode>,
);
