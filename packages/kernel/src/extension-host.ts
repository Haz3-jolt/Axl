// SPDX-FileCopyrightText: 2026 Hari Srinivasan
// SPDX-License-Identifier: Apache-2.0

/**
 * Extension-host lifecycle seam. The kernel owns when hosts start and stop;
 * extension behavior stays behind this boundary.
 */
export interface ExtensionHost {
  activate(): void | Promise<void>;
  dispose(): void | Promise<void>;
}

export const NOOP_EXTENSION_HOST: ExtensionHost = {
  activate: () => undefined,
  dispose: () => undefined,
};
