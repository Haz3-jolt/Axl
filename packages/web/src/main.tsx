// SPDX-FileCopyrightText: 2026 Hari Srinivasan
// SPDX-License-Identifier: Apache-2.0

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { AxlApp } from "./app.tsx";
import "./styles.css";

const root = document.getElementById("root");
if (root === null) throw new Error("Missing Axl application root");
createRoot(root).render(
  <StrictMode>
    <AxlApp />
  </StrictMode>,
);
