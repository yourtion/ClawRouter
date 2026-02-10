/**
 * openclaw-router
 *
 * Smart multi-provider LLM router for OpenClaw — 30+ models, x402 micropayments, API key auth, 78% cost savings.
 * Routes each request to the cheapest model that can handle it.
 *
 * Usage:
 *   # Install the plugin
 *   openclaw plugins install openclaw-router
 *
 *   # Fund your wallet with USDC on Base (for x402 payments)
 *
 *   # Use smart routing (auto-picks cheapest model)
 *   openclaw models set auto
 *
 *   # Or use any specific model
 *   openclaw models set openai/gpt-4o
 */

import type {
  OpenClawPluginDefinition,
  OpenClawPluginApi,
  PluginCommandContext,
  OpenClawPluginCommandDefinition,
} from "./types.js";
import { blockrunProvider, setActiveProxy } from "./provider.js";
import { startProxy, getProxyPort } from "./proxy.js";
import { resolveOrGenerateWalletKey, WALLET_FILE } from "./auth.js";
import type { RoutingConfig } from "./router/index.js";
import { BalanceMonitor } from "./balance.js";
// Multi-provider support
import {
  ProviderRegistry,
  ProviderFactory,
  loadConfig,
  BlockRunProvider,
  OpenRouterProvider,
} from "./providers/index.js";

/**
 * Wait for proxy health check to pass (quick check, not RPC).
 * Returns true if healthy within timeout, false otherwise.
 */
async function waitForProxyHealth(port: number, timeoutMs = 3000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      if (res.ok) return true;
    } catch {
      // Proxy not ready yet
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
}
import { OPENCLAW_MODELS } from "./models.js";
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { VERSION } from "./version.js";
import { privateKeyToAccount } from "viem/accounts";
import { getStats, formatStatsAscii } from "./stats.js";

/**
 * Detect if we're running in shell completion mode.
 * When `openclaw completion --shell zsh` runs, it loads plugins but only needs
 * the completion script output - any stdout logging pollutes the script and
 * causes zsh to interpret colored text like `[plugins]` as glob patterns.
 */
function isCompletionMode(): boolean {
  const args = process.argv;
  // Check for: openclaw completion --shell <shell>
  // argv[0] = node/bun, argv[1] = openclaw, argv[2] = completion
  return args.some((arg, i) => arg === "completion" && i >= 1 && i <= 3);
}

/**
 * Load and initialize providers from configuration.
 * Uses ProviderRegistry if multi-provider mode is enabled.
 */
async function initializeProviders(
  api: OpenClawPluginApi,
  walletKey: string
): Promise<void> {
  // Check if multi-provider mode is enabled
  const multiProviderEnabled =
    process.env.OPENCLAW_ROUTER_MULTI_PROVIDER === "true" ||
    process.env.CLAWROUTER_MULTI_PROVIDER === "true";

  if (!multiProviderEnabled) {
    // Legacy single-provider mode (BlockRun only)
    api.logger.info("Multi-provider mode disabled. Using legacy BlockRun-only mode.");
    return;
  }

  api.logger.info("Multi-provider mode enabled. Loading provider configuration...");

  try {
    // Load provider configuration
    const config = await loadConfig();

    if (config.providers.length === 0) {
      api.logger.warn("No providers configured. Using default BlockRun provider.");
      return;
    }

    // Initialize provider registry
    const registry = ProviderRegistry.getInstance();

    // Create provider instances
    for (const providerConfig of config.providers) {
      if (!providerConfig.enabled) {
        continue;
      }

      try {
        // Add wallet key to credentials for x402 providers
        if (providerConfig.auth.type === "x402_payment") {
          providerConfig.auth.credentials.walletKey =
            providerConfig.auth.credentials.walletKey || walletKey;
        }

        const provider = await ProviderFactory.create(providerConfig);
        registry.register(provider);

        api.logger.info(`Registered provider: ${providerConfig.id} (priority: ${providerConfig.priority})`);
      } catch (err) {
        api.logger.warn(
          `Failed to initialize provider ${providerConfig.id}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    // Health check all providers
    api.logger.info("Running provider health checks...");
    const healthResults = await registry.healthCheckAll();

    for (const [id, healthy] of healthResults) {
      if (healthy) {
        api.logger.info(`✓ Provider ${id} is healthy`);
      } else {
        api.logger.warn(`✗ Provider ${id} health check failed`);
      }
    }

    // Inject provider configurations into OpenClaw config
    await injectMultiProviderConfig(api, registry);
  } catch (err) {
    api.logger.error(
      `Failed to initialize providers: ${err instanceof Error ? err.message : String(err)}`
    );
    api.logger.info("Falling back to legacy BlockRun-only mode.");
  }
}

/**
 * Inject multi-provider model configurations into OpenClaw config.
 */
async function injectMultiProviderConfig(
  api: OpenClawPluginApi,
  registry: ProviderRegistry
): Promise<void> {
  const configPath = join(homedir(), ".openclaw", "openclaw.json");
  if (!existsSync(configPath)) {
    api.logger.info("OpenClaw config not found, skipping multi-provider injection");
    return;
  }

  try {
    const config = JSON.parse(readFileSync(configPath, "utf-8"));

    if (!config.models) config.models = {};
    if (!config.models.providers) config.models.providers = {};

    // Get all models from all providers
    const allModels = await registry.getAllModels();

    // For now, we'll inject models under each provider's ID
    // This allows users to reference models as "provider-id/model-name"
    for (const provider of registry.getEnabled()) {
      const providerId = provider.metadata.id;
      const proxyPort = getProxyPort();

      // For BlockRun, use the proxy URL
      // For other providers, use their base URL directly
      const baseUrl =
        providerId === "blockrun"
          ? `http://127.0.0.1:${proxyPort}/v1`
          : provider.metadata.baseUrl.replace(/\/$/, ""); // Remove trailing slash

      config.models.providers[providerId] = {
        baseUrl,
        api: "openai-completions",
        apiKey: provider.metadata.authType === "api_key" ? "provider-handles-api-key" : "x402-proxy-handles-auth",
        models: allModels
          .filter((m) => m.providerId === providerId)
          .map((m) => ({
            id: m.id,
            name: m.name,
            api: m.api,
            reasoning: m.reasoning,
            input: m.input,
            cost: m.cost,
            contextWindow: m.contextWindow,
            maxTokens: m.maxTokens,
          })),
      };
    }

    // Write updated config
    writeFileSync(configPath, JSON.stringify(config, null, 2));
    api.logger.info("Multi-provider models configuration injected");
  } catch (err) {
    api.logger.warn(`Failed to inject multi-provider config: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Inject BlockRun models config into OpenClaw config file.
 * This is required because registerProvider() alone doesn't make models available.
 */
function injectModelsConfig(logger: { info: (msg: string) => void }): void {
  const configPath = join(homedir(), ".openclaw", "openclaw.json");
  if (!existsSync(configPath)) {
    logger.info("OpenClaw config not found, skipping models injection");
    return;
  }

  try {
    const config = JSON.parse(readFileSync(configPath, "utf-8"));

    // Track if we need to write
    let needsWrite = false;

    // Inject models config if not present
    if (!config.models) config.models = {};
    if (!config.models.providers) config.models.providers = {};

    const proxyPort = getProxyPort();
    const expectedBaseUrl = `http://127.0.0.1:${proxyPort}/v1`;

    if (!config.models.providers.blockrun) {
      config.models.providers.blockrun = {
        baseUrl: expectedBaseUrl,
        api: "openai-completions",
        // apiKey is required by pi-coding-agent's ModelRegistry for providers with models.
        // We use a placeholder since the proxy handles real x402 auth internally.
        apiKey: "x402-proxy-handles-auth",
        models: OPENCLAW_MODELS,
      };
      needsWrite = true;
    } else {
      // Update existing config if fields are missing or outdated
      if (config.models.providers.blockrun.baseUrl !== expectedBaseUrl) {
        config.models.providers.blockrun.baseUrl = expectedBaseUrl;
        needsWrite = true;
      }
      // Ensure apiKey is present (required by ModelRegistry for /model picker)
      if (!config.models.providers.blockrun.apiKey) {
        config.models.providers.blockrun.apiKey = "x402-proxy-handles-auth";
        needsWrite = true;
      }
      // Always refresh models list (ensures new aliases are available)
      const currentModels = config.models.providers.blockrun.models as unknown[];
      if (!currentModels || currentModels.length !== OPENCLAW_MODELS.length) {
        config.models.providers.blockrun.models = OPENCLAW_MODELS;
        needsWrite = true;
      }
    }

    // Set blockrun/auto as default model for smart routing
    if (!config.agents) config.agents = {};
    if (!config.agents.defaults) config.agents.defaults = {};
    if (!config.agents.defaults.model) config.agents.defaults.model = {};
    if (config.agents.defaults.model.primary !== "blockrun/auto") {
      config.agents.defaults.model.primary = "blockrun/auto";
      needsWrite = true;
    }

    // Add key model aliases to allowlist for /model picker visibility
    // Only add essential aliases, not all 50+ models to avoid config pollution
    const KEY_MODEL_ALIASES = [
      { id: "auto", alias: "auto" },
      { id: "free", alias: "free" },
      { id: "sonnet", alias: "sonnet" },
      { id: "opus", alias: "opus" },
      { id: "haiku", alias: "haiku" },
      { id: "grok", alias: "grok" },
      { id: "deepseek", alias: "deepseek" },
      { id: "kimi", alias: "kimi" },
      { id: "gemini", alias: "gemini" },
      { id: "flash", alias: "flash" },
      { id: "gpt", alias: "gpt" },
      { id: "reasoner", alias: "reasoner" },
    ];

    if (!config.agents) config.agents = {};
    if (!config.agents.defaults) config.agents.defaults = {};
    if (!config.agents.defaults.models) config.agents.defaults.models = {};

    const allowlist = config.agents.defaults.models as Record<string, unknown>;
    for (const m of KEY_MODEL_ALIASES) {
      const fullId = `blockrun/${m.id}`;
      if (!allowlist[fullId]) {
        allowlist[fullId] = { alias: m.alias };
        needsWrite = true;
      }
    }

    if (needsWrite) {
      writeFileSync(configPath, JSON.stringify(config, null, 2));
      logger.info("Smart routing enabled (blockrun/auto)");
    }
  } catch {
    // Silently fail — config injection is best-effort
  }
}

/**
 * Inject dummy auth profile for BlockRun into agent auth stores.
 * OpenClaw's agent system looks for auth credentials even if provider has auth: [].
 * We inject a placeholder so the lookup succeeds (proxy handles real auth internally).
 */
function injectAuthProfile(logger: { info: (msg: string) => void }): void {
  const agentsDir = join(homedir(), ".openclaw", "agents");

  // Create agents directory if it doesn't exist
  if (!existsSync(agentsDir)) {
    try {
      mkdirSync(agentsDir, { recursive: true });
    } catch (err) {
      logger.info(
        `Could not create agents dir: ${err instanceof Error ? err.message : String(err)}`,
      );
      return;
    }
  }

  try {
    // Find all agent directories
    let agents = readdirSync(agentsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);

    // Always ensure "main" agent has auth (most common agent)
    if (!agents.includes("main")) {
      agents = ["main", ...agents];
    }

    for (const agentId of agents) {
      const authDir = join(agentsDir, agentId, "agent");
      const authPath = join(authDir, "auth-profiles.json");

      // Create agent dir if needed
      if (!existsSync(authDir)) {
        try {
          mkdirSync(authDir, { recursive: true });
        } catch {
          continue; // Skip if we can't create the dir
        }
      }

      // Load or create auth-profiles.json with correct OpenClaw format
      // Format: { version: 1, profiles: { "provider:profileId": { type, provider, key } } }
      let store: { version: number; profiles: Record<string, unknown> } = {
        version: 1,
        profiles: {},
      };
      if (existsSync(authPath)) {
        try {
          const existing = JSON.parse(readFileSync(authPath, "utf-8"));
          // Check if valid OpenClaw format (has version and profiles)
          if (existing.version && existing.profiles) {
            store = existing;
          }
          // Old format without version/profiles is discarded and recreated
        } catch {
          // Invalid JSON, use fresh store
        }
      }

      // Check if blockrun auth already exists (OpenClaw format: profiles["provider:profileId"])
      const profileKey = "blockrun:default";
      if (store.profiles[profileKey]) {
        continue; // Already configured
      }

      // Inject placeholder auth for blockrun (OpenClaw format)
      // The proxy handles real x402 auth internally, this just satisfies OpenClaw's lookup
      store.profiles[profileKey] = {
        type: "api_key",
        provider: "blockrun",
        key: "x402-proxy-handles-auth",
      };

      try {
        writeFileSync(authPath, JSON.stringify(store, null, 2));
        logger.info(`Injected BlockRun auth profile for agent: ${agentId}`);
      } catch (err) {
        logger.info(
          `Could not inject auth for ${agentId}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  } catch (err) {
    logger.info(`Auth injection failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// Store active proxy handle for cleanup on gateway_stop
let activeProxyHandle: Awaited<ReturnType<typeof startProxy>> | null = null;

/**
 * Start the x402 proxy in the background.
 * Called from register() because OpenClaw's loader only invokes register(),
 * treating activate() as an alias (def.register ?? def.activate).
 */
async function startProxyInBackground(api: OpenClawPluginApi): Promise<void> {
  // Resolve wallet key: saved file → env var → auto-generate
  const { key: walletKey, address, source } = await resolveOrGenerateWalletKey();

  // Log wallet source (brief - balance check happens after proxy starts)
  if (source === "generated") {
    api.logger.info(`Generated new wallet: ${address}`);
  } else if (source === "saved") {
    api.logger.info(`Using saved wallet: ${address}`);
  } else {
    api.logger.info(`Using wallet from BLOCKRUN_WALLET_KEY: ${address}`);
  }

  // Resolve routing config overrides from plugin config
  const routingConfig = api.pluginConfig?.routing as Partial<RoutingConfig> | undefined;

  const proxy = await startProxy({
    walletKey,
    routingConfig,
    onReady: (port) => {
      api.logger.info(`BlockRun x402 proxy listening on port ${port}`);
    },
    onError: (error) => {
      api.logger.error(`BlockRun proxy error: ${error.message}`);
    },
    onRouted: (decision) => {
      const cost = decision.costEstimate.toFixed(4);
      const saved = (decision.savings * 100).toFixed(0);
      api.logger.info(
        `[${decision.tier}] ${decision.model} $${cost} (saved ${saved}%) | ${decision.reasoning}`,
      );
    },
    onLowBalance: (info) => {
      api.logger.warn(`[!] Low balance: ${info.balanceUSD}. Fund wallet: ${info.walletAddress}`);
    },
    onInsufficientFunds: (info) => {
      api.logger.error(
        `[!] Insufficient funds. Balance: ${info.balanceUSD}, Needed: ${info.requiredUSD}. Fund wallet: ${info.walletAddress}`,
      );
    },
  });

  setActiveProxy(proxy);
  activeProxyHandle = proxy;

  api.logger.info(`ClawRouter ready — smart routing enabled`);
  api.logger.info(`Pricing: Simple ~$0.001 | Code ~$0.01 | Complex ~$0.05 | Free: $0`);

  // Non-blocking balance check AFTER proxy is ready (won't hang startup)
  const startupMonitor = new BalanceMonitor(address);
  startupMonitor
    .checkBalance()
    .then((balance) => {
      if (balance.isEmpty) {
        api.logger.info(`Wallet: ${address} | Balance: $0.00`);
        api.logger.info(`Using FREE model. Fund wallet for premium models.`);
      } else if (balance.isLow) {
        api.logger.info(`Wallet: ${address} | Balance: ${balance.balanceUSD} (low)`);
      } else {
        api.logger.info(`Wallet: ${address} | Balance: ${balance.balanceUSD}`);
      }
    })
    .catch(() => {
      // Silently continue - balance will be checked per-request anyway
      api.logger.info(`Wallet: ${address} | Balance: (checking...)`);
    });
}

/**
 * /stats command handler for ClawRouter.
 * Shows usage statistics and cost savings.
 */
async function createStatsCommand(): Promise<OpenClawPluginCommandDefinition> {
  return {
    name: "stats",
    description: "Show ClawRouter usage statistics and cost savings",
    acceptsArgs: true,
    requireAuth: false,
    handler: async (ctx: PluginCommandContext) => {
      const arg = ctx.args?.trim().toLowerCase() || "7";
      const days = parseInt(arg, 10) || 7;

      try {
        const stats = await getStats(Math.min(days, 30)); // Cap at 30 days
        const ascii = formatStatsAscii(stats);

        return {
          text: ["```", ascii, "```"].join("\n"),
        };
      } catch (err) {
        return {
          text: `Failed to load stats: ${err instanceof Error ? err.message : String(err)}`,
          isError: true,
        };
      }
    },
  };
}

/**
 * /wallet command handler for ClawRouter.
 * - /wallet or /wallet status: Show wallet address, balance, and key file location
 * - /wallet export: Show private key for backup (with security warning)
 */
async function createWalletCommand(): Promise<OpenClawPluginCommandDefinition> {
  return {
    name: "wallet",
    description: "Show BlockRun wallet info or export private key for backup",
    acceptsArgs: true,
    requireAuth: true,
    handler: async (ctx: PluginCommandContext) => {
      const subcommand = ctx.args?.trim().toLowerCase() || "status";

      // Read wallet key if it exists
      let walletKey: string | undefined;
      let address: string | undefined;
      try {
        if (existsSync(WALLET_FILE)) {
          walletKey = readFileSync(WALLET_FILE, "utf-8").trim();
          if (walletKey.startsWith("0x") && walletKey.length === 66) {
            const account = privateKeyToAccount(walletKey as `0x${string}`);
            address = account.address;
          }
        }
      } catch {
        // Wallet file doesn't exist or is invalid
      }

      if (!walletKey || !address) {
        return {
          text: `No OpenClaw Router wallet found.\n\nRun \`openclaw plugins install openclaw-router\` to generate a wallet.`,
          isError: true,
        };
      }

      if (subcommand === "export") {
        // Export private key for backup
        return {
          text: [
            "🔐 **ClawRouter Wallet Export**",
            "",
            "⚠️ **SECURITY WARNING**: Your private key controls your wallet funds.",
            "Never share this key. Anyone with this key can spend your USDC.",
            "",
            `**Address:** \`${address}\``,
            "",
            `**Private Key:**`,
            `\`${walletKey}\``,
            "",
            "**To restore on a new machine:**",
            "1. Set the environment variable before running OpenClaw:",
            `   \`export BLOCKRUN_WALLET_KEY=${walletKey}\``,
            "2. Or save to file:",
            `   \`mkdir -p ~/.openclaw/blockrun && echo "${walletKey}" > ~/.openclaw/blockrun/wallet.key && chmod 600 ~/.openclaw/blockrun/wallet.key\``,
          ].join("\n"),
        };
      }

      // Default: show wallet status
      let balanceText = "Balance: (checking...)";
      try {
        const monitor = new BalanceMonitor(address);
        const balance = await monitor.checkBalance();
        balanceText = `Balance: ${balance.balanceUSD}`;
      } catch {
        balanceText = "Balance: (could not check)";
      }

      return {
        text: [
          "🦞 **ClawRouter Wallet**",
          "",
          `**Address:** \`${address}\``,
          `**${balanceText}**`,
          `**Key File:** \`${WALLET_FILE}\``,
          "",
          "**Commands:**",
          "• `/wallet` - Show this status",
          "• `/wallet export` - Export private key for backup",
          "",
          `**Fund with USDC on Base:** https://basescan.org/address/${address}`,
        ].join("\n"),
      };
    },
  };
}

const plugin: OpenClawPluginDefinition = {
  id: "clawrouter",
  name: "ClawRouter",
  description: "Smart LLM router — 30+ models, x402 micropayments, 78% cost savings",
  version: VERSION,

  async register(api: OpenClawPluginApi) {
    // Check if ClawRouter is disabled via environment variable
    // Usage: CLAWROUTER_DISABLED=true openclaw gateway start
    const isDisabled =
      process.env.CLAWROUTER_DISABLED === "true" || process.env.CLAWROUTER_DISABLED === "1";
    if (isDisabled) {
      api.logger.info("ClawRouter disabled (CLAWROUTER_DISABLED=true). Using default routing.");
      return;
    }

    // Skip heavy initialization in completion mode — only completion script is needed
    // Logging to stdout during completion pollutes the script and causes zsh errors
    if (isCompletionMode()) {
      api.registerProvider(blockrunProvider);
      return;
    }

    // Register BlockRun as a provider (sync — available immediately)
    api.registerProvider(blockrunProvider);

    // Initialize multi-provider support (if enabled)
    // This loads additional providers from configuration
    const walletInfo = await resolveOrGenerateWalletKey();
    const walletKey = typeof walletInfo === "string" ? walletInfo : walletInfo.key;
    await initializeProviders(api, walletKey);

    // Inject models config into OpenClaw config file
    // This persists the config so models are recognized on restart
    injectModelsConfig(api.logger);

    // Inject dummy auth profiles into agent auth stores
    // OpenClaw's agent system looks for auth even if provider has auth: []
    injectAuthProfile(api.logger);

    // Also set runtime config for immediate availability
    const runtimePort = getProxyPort();
    if (!api.config.models) {
      api.config.models = { providers: {} };
    }
    if (!api.config.models.providers) {
      api.config.models.providers = {};
    }
    api.config.models.providers.blockrun = {
      baseUrl: `http://127.0.0.1:${runtimePort}/v1`,
      api: "openai-completions",
      // apiKey is required by pi-coding-agent's ModelRegistry for providers with models.
      apiKey: "x402-proxy-handles-auth",
      models: OPENCLAW_MODELS,
    };

    // Set blockrun/auto as default for smart routing
    if (!api.config.agents) api.config.agents = {};
    const agents = api.config.agents as Record<string, unknown>;
    if (!agents.defaults) agents.defaults = {};
    const defaults = agents.defaults as Record<string, unknown>;
    if (!defaults.model) defaults.model = {};
    (defaults.model as Record<string, unknown>).primary = "blockrun/auto";

    api.logger.info("BlockRun provider registered (30+ models via x402)");

    // Register /wallet command for wallet management
    createWalletCommand()
      .then((walletCommand) => {
        api.registerCommand(walletCommand);
      })
      .catch((err) => {
        api.logger.warn(
          `Failed to register /wallet command: ${err instanceof Error ? err.message : String(err)}`,
        );
      });

    // Register /stats command for usage statistics
    createStatsCommand()
      .then((statsCommand) => {
        api.registerCommand(statsCommand);
      })
      .catch((err) => {
        api.logger.warn(
          `Failed to register /stats command: ${err instanceof Error ? err.message : String(err)}`,
        );
      });

    // Register a service with stop() for cleanup on gateway shutdown
    // This prevents EADDRINUSE when the gateway restarts
    api.registerService({
      id: "clawrouter-proxy",
      start: () => {
        // No-op: proxy is started in register() below for immediate availability
      },
      stop: async () => {
        // Close proxy on gateway shutdown to release port 8402
        if (activeProxyHandle) {
          try {
            await activeProxyHandle.close();
            api.logger.info("BlockRun proxy closed");
          } catch (err) {
            api.logger.warn(
              `Failed to close proxy: ${err instanceof Error ? err.message : String(err)}`,
            );
          }
          activeProxyHandle = null;
        }
      },
    });

    // Start x402 proxy and wait for it to be ready
    // Must happen in register() for CLI command support (services only start with gateway)
    try {
      await startProxyInBackground(api);

      // Wait for proxy to be healthy (quick HTTP check, no RPC)
      const port = getProxyPort();
      const healthy = await waitForProxyHealth(port);
      if (!healthy) {
        api.logger.warn(`Proxy health check timed out, commands may not work immediately`);
      }
    } catch (err) {
      api.logger.error(
        `Failed to start BlockRun proxy: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  },
};

export default plugin;

// Re-export for programmatic use
export { startProxy, getProxyPort } from "./proxy.js";
export type { ProxyOptions, ProxyHandle, LowBalanceInfo, InsufficientFundsInfo } from "./proxy.js";
export { blockrunProvider } from "./provider.js";
// Multi-provider exports
export {
  ProviderRegistry,
  ProviderFactory,
  loadConfig,
  saveConfig,
  BlockRunProvider,
  OpenRouterProvider,
} from "./providers/index.js";
export type {
  IProvider,
  ProviderConfig,
  ProviderMetadata,
  StandardModel,
  RequestContext,
  ProviderResponse,
  ProviderBalanceInfo,
  AuthConfig,
  AuthType,
} from "./providers/index.js";
export {
  OPENCLAW_MODELS,
  BLOCKRUN_MODELS,
  buildProviderModels,
  MODEL_ALIASES,
  resolveModelAlias,
  isAgenticModel,
  getAgenticModels,
  getModelContextWindow,
} from "./models.js";
export {
  route,
  DEFAULT_ROUTING_CONFIG,
  getFallbackChain,
  getFallbackChainFiltered,
} from "./router/index.js";
export type { RoutingDecision, RoutingConfig, Tier } from "./router/index.js";
export { logUsage } from "./logger.js";
export type { UsageEntry } from "./logger.js";
export { RequestDeduplicator } from "./dedup.js";
export type { CachedResponse } from "./dedup.js";
export { PaymentCache } from "./payment-cache.js";
export type { CachedPaymentParams } from "./payment-cache.js";
export { createPaymentFetch } from "./x402.js";
export type { PreAuthParams, PaymentFetchResult } from "./x402.js";
export { BalanceMonitor, BALANCE_THRESHOLDS } from "./balance.js";
export type { SufficiencyResult } from "./balance.js";
export type { BalanceInfo as X402BalanceInfo } from "./balance.js";
export {
  InsufficientFundsError,
  EmptyWalletError,
  RpcError,
  isInsufficientFundsError,
  isEmptyWalletError,
  isBalanceError,
  isRpcError,
} from "./errors.js";
export { fetchWithRetry, isRetryable, DEFAULT_RETRY_CONFIG } from "./retry.js";
export type { RetryConfig } from "./retry.js";
export { getStats, formatStatsAscii } from "./stats.js";
export type { DailyStats, AggregatedStats } from "./stats.js";
export { SessionStore, getSessionId, DEFAULT_SESSION_CONFIG } from "./session.js";
export type { SessionEntry, SessionConfig } from "./session.js";
