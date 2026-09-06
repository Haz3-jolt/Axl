<!-- SPDX-FileCopyrightText: 2026 Hari Srinivasan -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# `@axl/ai`

This package keeps provider-specific behavior outside the kernel. It defines provider and model contracts, credential lookup, thinking levels, tool dialects, deterministic test models, and the Azure OpenAI Responses adapter with Axl's built-in model catalog.

Ordinary requests use the selected model's advertised output maximum, reduced only to fit estimated input plus a 4,096-token context reserve. The adapter sends the effective ceiling explicitly. Model HTTP transport uses Undici with a configurable five-minute default inactivity timeout for headers and response-body bytes. Streaming bytes refresh the timeout, zero disables it, and no absolute request deadline is imposed.
