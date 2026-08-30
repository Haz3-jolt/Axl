// SPDX-FileCopyrightText: 2026 Hari Srinivasan
// SPDX-License-Identifier: Apache-2.0

import type { ModelCapabilities, ModelInfo, ModelRequest } from "./model.ts";

export type ModelCapability = keyof ModelCapabilities;

export class ModelCapabilityError extends Error {
  readonly modelId: string;
  readonly missing: readonly ModelCapability[];

  constructor(model: ModelInfo, missing: readonly ModelCapability[]) {
    super(`Model ${model.providerId}/${model.modelId} does not support: ${missing.join(", ")}`);
    this.name = "ModelCapabilityError";
    this.modelId = model.modelId;
    this.missing = missing;
  }
}

/** The capabilities a request actually exercises. */
export function requiredCapabilities(request: ModelRequest): readonly ModelCapability[] {
  const required: ModelCapability[] = [];
  if (request.tools !== undefined && request.tools.length > 0) required.push("toolUse");
  const usesImages = request.messages.some((message) =>
    message.content.some(
      (item) => item.type === "blob" && item.blob.mediaType.startsWith("image/"),
    ),
  );
  if (usesImages) required.push("imageInput");
  return required;
}

/** Capabilities from `required` that `model` lacks. */
export function missingCapabilities(
  model: ModelInfo,
  required: readonly ModelCapability[],
): readonly ModelCapability[] {
  return required.filter((capability) => !model.capabilities[capability]);
}

/**
 * Fails before dispatch when the model cannot serve the request. Role
 * requirements beyond the request itself (e.g. `structuredOutput` for a
 * facet-extraction role) are passed as `extra`.
 */
export function assertModelSupports(
  model: ModelInfo,
  request: ModelRequest,
  extra: readonly ModelCapability[] = [],
): void {
  const missing = missingCapabilities(model, [...requiredCapabilities(request), ...extra]);
  if (missing.length > 0) throw new ModelCapabilityError(model, missing);
}
