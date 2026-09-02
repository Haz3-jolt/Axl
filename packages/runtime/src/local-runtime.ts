// SPDX-FileCopyrightText: 2026 Hari Srinivasan
// SPDX-License-Identifier: Apache-2.0

import { access } from "node:fs/promises";
import { join } from "node:path";

import type { CredentialStore } from "@axl/ai";
import type { AxlDaemon } from "@axl/daemon";
import type { ThinkingLevel } from "@axl/protocol";

export interface LocalRuntimeDefaults {
  readonly modelId: string;
  readonly thinkingLevel: ThinkingLevel;
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

export interface LocalDaemonOptions {
  readonly axlHome: string;
  readonly stateDirectory: string;
  readonly socketPath: string;
  readonly defaults: LocalRuntimeDefaults;
  readonly store: CredentialStore;
  readonly unsafe: boolean;
}

/**
 * Starts the authoritative local daemon and assembles its model, tools,
 * extensions, policy, and sandbox without depending on a presentation client.
 */
export async function startLocalDaemon(options: LocalDaemonOptions): Promise<AxlDaemon> {
  const { axlHome, stateDirectory, socketPath, defaults, store, unsafe } = options;
  let assemblyPromise:
    | Promise<{
        ai: typeof import("@axl/ai");
        kernel: typeof import("@axl/kernel");
        sandbox: Awaited<ReturnType<typeof import("@axl/sandbox")["detectPlatformSandbox"]>>;
        provider: ReturnType<typeof import("@axl/ai")["createAzureOpenAiProvider"]>;
      }>
    | undefined;
  const loadAssembly = () => {
    assemblyPromise ??= Promise.all([
      import("@axl/ai"),
      import("@axl/kernel"),
      import("@axl/sandbox"),
    ]).then(async ([ai, kernel, sandboxPackage]) => {
      const sandbox = unsafe
        ? sandboxPackage.createUnsafePlatformExecution()
        : await sandboxPackage.detectPlatformSandbox();
      if (!sandbox.available) {
        throw new sandboxPackage.SandboxUnavailableError(sandbox.reason ?? "unknown");
      }
      return {
        ai,
        kernel,
        sandbox,
        provider: ai.createAzureOpenAiProvider({ store, context: ai.nodeAuthContext }),
      };
    });
    return assemblyPromise;
  };

  // Sandboxed startup fails closed before listening. Unsafe startup may listen
  // first because its lack of isolation is already explicit and logged.
  if (!unsafe) await loadAssembly();
  const { AxlDaemon } = await import("@axl/daemon");
  const daemon = new AxlDaemon({
    socketPath,
    dataDirectory: stateDirectory,
    securityMode: unsafe ? "unsafe" : "sandboxed",
    runtime: async ({ sessionId, cwd, boundary, selection, interact, readBlob }) => {
      const { ai, kernel, sandbox, provider } = await loadAssembly();
      const [hasMcpConfig, hasSkills] = await Promise.all([
        Promise.all([
          exists(join(axlHome, "mcp.json")),
          exists(join(cwd, ".axl", "mcp.json")),
        ]).then((values) => values.some(Boolean)),
        Promise.all([exists(join(axlHome, "skills")), exists(join(cwd, ".axl", "skills"))]).then(
          (values) => values.some(Boolean),
        ),
      ]);
      const [mcpPackage, skillsPackage] = await Promise.all([
        hasMcpConfig ? import("@axl/extension-mcp") : Promise.resolve(undefined),
        hasSkills ? import("@axl/extension-skills") : Promise.resolve(undefined),
      ]);
      const [resolved, instructions, skills, mcpServers] = await Promise.all([
        ai.resolveProviderAuth(
          ai.AZURE_OPENAI_PROVIDER_ID,
          { apiKey: ai.azureOpenAiAuthMethod },
          store,
          ai.nodeAuthContext,
        ),
        kernel.loadAgentsInstructions({ cwd, globalPath: join(axlHome, "AGENTS.md") }),
        skillsPackage === undefined
          ? Promise.resolve([])
          : skillsPackage.discoverSkills({ cwd, globalDirectory: join(axlHome, "skills") }),
        mcpPackage === undefined
          ? Promise.resolve([])
          : mcpPackage.loadMcpConfig({ cwd, globalDirectory: axlHome }),
      ]);
      const active: LocalRuntimeDefaults = {
        modelId: selection.modelId ?? defaults.modelId,
        thinkingLevel: selection.thinkingLevel ?? defaults.thinkingLevel,
      };
      const modelInfo = ai.AZURE_OPENAI_MODELS.find(
        (candidate) => candidate.modelId === active.modelId,
      );
      if (modelInfo === undefined) throw new Error(`Unknown Azure OpenAI model ${active.modelId}`);
      const thinking = ai.clampThinkingLevel(modelInfo, active.thinkingLevel);
      const policy = {
        workspace: cwd,
        readableRoots: [cwd],
        protectedPaths: [axlHome],
      };
      const model = ai.modelPortForSession(provider, {
        modelId: active.modelId,
        thinkingLevel: thinking.effective,
        readBlob,
      });
      const tools = new kernel.ToolRegistry();
      const overflowDirectory = join(stateDirectory, "tool-output");
      tools.register(sandbox.makeShellTool({ cwd, overflowDirectory, policy }));
      tools.register(kernel.makeReadTool({ cwd, ...(unsafe ? {} : { policy }) }));
      tools.register(kernel.makeEditTool({ cwd, ...(unsafe ? {} : { policy }) }));

      if (skillsPackage !== undefined && skills.length > 0) {
        tools.register(skillsPackage.makeSkillTool(skills));
      }
      const mcpSecrets = mcpPackage?.mcpSecretValues(mcpServers) ?? [];
      const mcp =
        mcpPackage === undefined || mcpServers.length === 0
          ? undefined
          : new mcpPackage.McpManager({
              servers: mcpServers,
              cwd,
              sessionId,
              stateDirectory: join(stateDirectory, "mcp"),
              blobDirectory: join(stateDirectory, "blobs"),
              model,
              modelId: active.modelId,
              secretValues: mcpSecrets,
              interact,
              wrapStdio: (input) => sandbox.wrapProcess({ policy, ...input }),
            });
      if (mcp) tools.register(mcp.makeTool());

      const skillSection = skillsPackage?.skillCatalogSection(skills);
      const prompt = kernel.buildStablePrompt({
        cwd,
        tools: tools.declarations().map(({ name, description }) => ({ name, description })),
        ...(unsafe
          ? {
              constraints: [
                ...kernel.ESSENTIAL_CONSTRAINTS,
                "No operating-system sandbox is active. Commands and file tools have the user's full host access.",
              ],
            }
          : {}),
        instructions: [...instructions, ...(skillSection === undefined ? [] : [skillSection])],
      });
      return {
        model,
        tools,
        ...(mcp === undefined ? {} : { extensionHost: mcp }),
        prompt,
        log: { secretValues: [...resolved.secretValues, ...mcpSecrets] },
        sandbox: sandbox.configuredPayload(),
        configModel: { modelId: active.modelId },
        configThinking: thinking,
        ...(boundary === "config_change"
          ? {}
          : {
              configDialect: ai.dialectBoundaryPayload(
                new ai.FrozenToolRoster(ai.OPENAI_CHAT_TOOL_DIALECT, tools.declarations()),
                boundary,
              ),
            }),
      };
    },
  });
  await daemon.start();
  return daemon;
}
