/**
 * Provider Configuration Loader
 *
 * Loads and manages provider configuration from files and environment variables.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ProviderConfig, ProvidersConfig } from "./types.js";
import { AuthType } from "./types.js";

const CONFIG_DIR = join(homedir(), ".openclaw", "clawrouter");
const CONFIG_FILE = join(CONFIG_DIR, "providers.json");

/**
 * Get default configuration
 */
function getDefaultConfig(): ProvidersConfig {
  return {
    version: "2.0",
    providers: [
      {
        id: "blockrun",
        type: "blockrun",
        enabled: true,
        priority: 100,
        auth: {
          type: AuthType.X402_PAYMENT,
          credentials: {
            walletKey: process.env.BLOCKRUN_WALLET_KEY,
          },
        },
        models: {
          autoSync: false,
        },
      },
    ],
  };
}

/**
 * Replace environment variable placeholders in credentials
 */
function resolveEnvironmentVariables(config: ProvidersConfig): ProvidersConfig {
  for (const provider of config.providers) {
    if (provider.auth.type === AuthType.API_KEY) {
      const apiKey = provider.auth.credentials.apiKey as string;

      if (apiKey?.startsWith("${") && apiKey.endsWith("}")) {
        const envVar = apiKey.slice(2, -1);
        const value = process.env[envVar];

        if (value) {
          provider.auth.credentials.apiKey = value;
        } else {
          console.warn(
            `[Config] Environment variable ${envVar} not set, disabling ${provider.id}`
          );
          provider.enabled = false;
        }
      }
    } else if (provider.auth.type === AuthType.X402_PAYMENT) {
      const walletKey = provider.auth.credentials.walletKey as string;

      if (walletKey?.startsWith("${") && walletKey.endsWith("}")) {
        const envVar = walletKey.slice(2, -1);
        const value = process.env[envVar];

        if (value) {
          provider.auth.credentials.walletKey = value;
        } else {
          console.warn(
            `[Config] Environment variable ${envVar} not set, disabling ${provider.id}`
          );
          provider.enabled = false;
        }
      }
    }
  }

  return config;
}

/**
 * Validate configuration
 */
function validateConfig(config: ProvidersConfig): ProvidersConfig {
  // Ensure version is set
  if (!config.version) {
    config.version = "2.0";
  }

  // Validate each provider
  for (const provider of config.providers) {
    if (!provider.id) {
      throw new Error("Provider must have an 'id' field");
    }

    if (!provider.auth || !provider.auth.type) {
      throw new Error(`Provider ${provider.id} must have auth.type`);
    }

    // Set defaults
    provider.priority = provider.priority ?? 50;
    provider.enabled = provider.enabled ?? true;
    provider.models = provider.models ?? { autoSync: true };
  }

  return config;
}

/**
 * Load configuration from file
 */
export async function loadConfig(customPath?: string): Promise<ProvidersConfig> {
  const configPath = customPath || CONFIG_FILE;

  if (!existsSync(configPath)) {
    console.log(`[Config] No config file found at ${configPath}, using defaults`);
    const defaultConfig = getDefaultConfig();
    await saveConfig(defaultConfig);
    return resolveEnvironmentVariables(defaultConfig);
  }

  try {
    const content = readFileSync(configPath, "utf-8");
    const config = JSON.parse(content) as ProvidersConfig;

    // Validate and resolve environment variables
    const validated = validateConfig(config);
    return resolveEnvironmentVariables(validated);
  } catch (err) {
    console.error(`[Config] Failed to load config from ${configPath}:`, err);
    console.log("[Config] Falling back to default configuration");
    const defaultConfig = getDefaultConfig();
    return resolveEnvironmentVariables(defaultConfig);
  }
}

/**
 * Save configuration to file
 */
export async function saveConfig(config: ProvidersConfig, customPath?: string): Promise<void> {
  const configPath = customPath || CONFIG_FILE;

  // Ensure directory exists
  if (!existsSync(dirname(configPath))) {
    mkdirSync(dirname(configPath), { recursive: true });
  }

  // Write config with restricted permissions
  const content = JSON.stringify(config, null, 2);
  writeFileSync(configPath, content, { mode: 0o600 });

  console.log(`[Config] Saved configuration to ${configPath}`);
}

/**
 * Get provider configurations from loaded config
 */
export async function getProviderConfigs(customPath?: string): Promise<ProviderConfig[]> {
  const config = await loadConfig(customPath);
  return config.providers;
}

/**
 * Export example configuration
 */
export function getExampleConfig(): ProvidersConfig {
  return {
    version: "2.0",
    providers: [
      {
        id: "blockrun",
        type: "blockrun",
        enabled: true,
        priority: 100,
        auth: {
          type: AuthType.X402_PAYMENT,
          credentials: {
            walletKey: "${BLOCKRUN_WALLET_KEY}",
          },
        },
        models: {
          autoSync: false,
        },
      },
      {
        id: "openrouter",
        type: "openrouter",
        enabled: true,
        priority: 90,
        auth: {
          type: AuthType.API_KEY,
          credentials: {
            apiKey: "${OPENROUTER_API_KEY}",
          },
        },
        models: {
          autoSync: true,
        },
      },
    ],
  };
}
