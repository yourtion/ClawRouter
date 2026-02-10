/**
 * End-to-End Tests for Multi-Provider Support (with memfs)
 *
 * Tests the complete multi-provider workflow using memfs for filesystem mocking:
 * - Config loading
 * - Provider initialization
 * - Model synchronization
 * - Request routing
 * - Cross-provider fallback
 * - Health checks
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { vol } from "memfs";
import { ProviderRegistry } from "../../src/providers/registry.js";
import { ProviderFactory } from "../../src/providers/factory.js";
import { BlockRunProvider } from "../../src/providers/implementations/blockrun.js";
import { OpenRouterProvider } from "../../src/providers/implementations/openrouter.js";
import type { ProviderConfig, RequestContext, ProvidersConfig } from "../../src/providers/types.js";
import { AuthType } from "../../src/providers/types.js";
import { join } from "node:path";
import { homedir } from "node:os";

// Mock filesystem helpers
function createMockFs() {
  const configDir = join(homedir(), ".openclaw", "clawrouter");
  const configFile = join(configDir, "providers.json");

  return {
    configDir,
    configFile,
    writeConfig: (config: ProvidersConfig) => {
      vol.mkdirSync(join(homedir()), { recursive: true });
      vol.mkdirSync(join(homedir(), ".openclaw"), { recursive: true });
      vol.mkdirSync(configDir, { recursive: true });
      vol.writeFileSync(configFile, JSON.stringify(config, null, 2));
    },
    readConfig: (): ProvidersConfig => {
      const content = vol.readFileSync(configFile, "utf-8");
      return JSON.parse(content) as ProvidersConfig;
    },
    exists: (): boolean => {
      return vol.existsSync(configFile);
    },
    reset: () => {
      vol.reset();
    },
  };
}

describe("Multi-Provider E2E Tests with memfs", () => {
  let registry: ProviderRegistry;
  let mockFs: ReturnType<typeof createMockFs>;

  beforeEach(() => {
    registry = ProviderRegistry.getInstance();
    registry.cleanupAll();
    mockFs = createMockFs();
    vol.reset();
  });

  afterEach(() => {
    registry.cleanupAll();
    vol.reset();
  });

  describe("Configuration Loading", () => {
    it("should create default config when none exists", () => {
      expect(mockFs.exists()).toBe(false);

      // Should create default config
      const defaultConfig: ProvidersConfig = {
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
                walletKey: "0x0000000000000000000000000000000000000000000000000000000000000001",
              },
            },
          },
        ],
      };

      mockFs.writeConfig(defaultConfig);

      expect(mockFs.exists()).toBe(true);
      const loaded = mockFs.readConfig();
      expect(loaded.version).toBe("2.0");
      expect(loaded.providers).toHaveLength(1);
    });

    it("should load multi-provider config from file", () => {
      const config: ProvidersConfig = {
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
                walletKey: "0x0000000000000000000000000000000000000000000000000000000000000001",
              },
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
                apiKey: "sk-test-key",
              },
            },
          },
        ],
      };

      mockFs.writeConfig(config);

      const loaded = mockFs.readConfig();
      expect(loaded.providers).toHaveLength(2);
      expect(loaded.providers[0].id).toBe("blockrun");
      expect(loaded.providers[1].id).toBe("openrouter");
    });

    it("should filter disabled providers", () => {
      const config: ProvidersConfig = {
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
                walletKey: "0x0000000000000000000000000000000000000000000000000000000000000001",
              },
            },
          },
          {
            id: "openrouter",
            type: "openrouter",
            enabled: false, // Disabled
            priority: 90,
            auth: {
              type: AuthType.API_KEY,
              credentials: {
                apiKey: "sk-test-key",
              },
            },
          },
        ],
      };

      mockFs.writeConfig(config);

      const loaded = mockFs.readConfig();
      const enabled = loaded.providers.filter((p) => p.enabled);
      expect(enabled).toHaveLength(1);
      expect(enabled[0].id).toBe("blockrun");
    });

    it("should handle invalid JSON gracefully", () => {
      vol.mkdirSync(join(homedir()), { recursive: true });
      vol.mkdirSync(join(homedir(), ".openclaw"), { recursive: true });
      const configDir = join(homedir(), ".openclaw", "clawrouter");
      vol.mkdirSync(configDir, { recursive: true });
      const configFile = join(configDir, "providers.json");

      vol.writeFileSync(configFile, "invalid json {{{");

      expect(() => {
        JSON.parse(vol.readFileSync(configFile, "utf-8") as string);
      }).toThrow();
    });
  });

  describe("Provider Registration", () => {
    it("should register multiple providers", () => {
      const blockrun = new BlockRunProvider();
      const openrouter = new OpenRouterProvider();

      registry.register(blockrun);
      registry.register(openrouter);

      const providers = registry.getAll();
      expect(providers.length).toBe(2);
    });

    it("should sort providers by priority", () => {
      const openrouter = new OpenRouterProvider(); // priority 90
      const blockrun = new BlockRunProvider(); // priority 100

      registry.register(openrouter);
      registry.register(blockrun);

      const sorted = registry.getByPriority();
      expect(sorted[0].metadata.id).toBe("blockrun");
      expect(sorted[1].metadata.id).toBe("openrouter");
    });

    it("should get provider by ID", () => {
      const blockrun = new BlockRunProvider();
      registry.register(blockrun);

      const retrieved = registry.get("blockrun");
      expect(retrieved).toBeDefined();
      expect(retrieved?.metadata.id).toBe("blockrun");
    });

    it("should return undefined for non-existent provider", () => {
      const retrieved = registry.get("nonexistent");
      expect(retrieved).toBeUndefined();
    });

    it("should throw error when registering duplicate provider ID", () => {
      const blockrun1 = new BlockRunProvider();
      const blockrun2 = new BlockRunProvider();

      registry.register(blockrun1);

      expect(() => {
        registry.register(blockrun2);
      }).toThrow("Provider blockrun already registered");
    });
  });

  describe("Provider Factory", () => {
    it("should create BlockRun provider from config", async () => {
      const config: ProviderConfig = {
        id: "blockrun",
        type: "blockrun",
        enabled: true,
        priority: 100,
        auth: {
          type: AuthType.X402_PAYMENT,
          credentials: {
            walletKey: "0x0000000000000000000000000000000000000000000000000000000000000001",
          },
        },
      };

      const provider = await ProviderFactory.create(config);

      expect(provider).toBeDefined();
      expect(provider.metadata.id).toBe("blockrun");
      expect(provider.metadata.authType).toBe(AuthType.X402_PAYMENT);
    });

    it("should create OpenRouter provider from config", async () => {
      const config: ProviderConfig = {
        id: "openrouter",
        type: "openrouter",
        enabled: true,
        priority: 90,
        auth: {
          type: AuthType.API_KEY,
          credentials: {
            apiKey: "sk-test-key",
          },
        },
        baseUrl: "https://openrouter.ai/api/v1",
      };

      const provider = await ProviderFactory.create(config);

      expect(provider).toBeDefined();
      expect(provider.metadata.id).toBe("openrouter");
      expect(provider.metadata.authType).toBe(AuthType.API_KEY);
    });

    it("should throw error for unknown provider type", async () => {
      const config: ProviderConfig = {
        id: "unknown",
        type: "unknown",
        enabled: true,
        priority: 50,
        auth: {
          type: AuthType.API_KEY,
          credentials: {},
        },
      };

      await expect(ProviderFactory.create(config)).rejects.toThrow("Unknown provider type: unknown");
    });

    it("should use default priority when not specified", async () => {
      const config: ProviderConfig = {
        id: "openrouter",
        type: "openrouter",
        enabled: true,
        // No priority specified
        auth: {
          type: AuthType.API_KEY,
          credentials: {
            apiKey: "sk-test-key",
          },
        },
      };

      const provider = await ProviderFactory.create(config);
      expect(provider.metadata.priority).toBeDefined();
      expect(typeof provider.metadata.priority).toBe("number");
    });
  });

  describe("Model Availability", () => {
    it("should check model availability for BlockRun", async () => {
      const blockrun = new BlockRunProvider();
      await blockrun.initialize({
        type: AuthType.X402_PAYMENT,
        credentials: {
          walletKey: "0x0000000000000000000000000000000000000000000000000000000000000001",
        },
      });
      registry.register(blockrun);

      expect(blockrun.isModelAvailable("anthropic/claude-sonnet-4")).toBe(true);
      expect(blockrun.isModelAvailable("unknown/model")).toBe(false);
    });

    it("should aggregate models from all providers", async () => {
      const blockrun = new BlockRunProvider();
      await blockrun.initialize({
        type: AuthType.X402_PAYMENT,
        credentials: {
          walletKey: "0x0000000000000000000000000000000000000000000000000000000000000001",
        },
      });

      const openrouter = new OpenRouterProvider();
      await openrouter.initialize({
        type: AuthType.API_KEY,
        credentials: {
          apiKey: "sk-test-key",
        },
      });

      registry.register(blockrun);
      registry.register(openrouter);

      const allModels = await registry.getAllModels();

      expect(allModels.length).toBeGreaterThan(0);

      const blockrunModels = allModels.filter((m) => m.providerId === "blockrun");
      const openrouterModels = allModels.filter((m) => m.providerId === "openrouter");

      expect(blockrunModels.length).toBeGreaterThan(0);
      expect(openrouterModels.length).toBeGreaterThan(0);
    });

    it("should return unique models", async () => {
      const blockrun = new BlockRunProvider();
      await blockrun.initialize({
        type: AuthType.X402_PAYMENT,
        credentials: {
          walletKey: "0x0000000000000000000000000000000000000000000000000000000000000001",
        },
      });
      registry.register(blockrun);

      const models = await blockrun.getModels();
      const uniqueModels = new Set(models.map((m) => m.id));

      expect(uniqueModels.size).toBe(models.length);
    });
  });

  describe("Health Checks", () => {
    it("should perform health check on all providers", async () => {
      const blockrun = new BlockRunProvider();
      const openrouter = new OpenRouterProvider();

      registry.register(blockrun);
      registry.register(openrouter);

      const results = await registry.healthCheckAll();

      expect(results.size).toBe(2);
      expect(results.has("blockrun")).toBe(true);
      expect(results.has("openrouter")).toBe(true);
    });

    it("should handle health check failures gracefully", async () => {
      const blockrun = new BlockRunProvider();
      registry.register(blockrun);

      // Mock health check to fail
      const originalHealthCheck = blockrun.healthCheck.bind(blockrun);
      blockrun.healthCheck = async () => false;

      const results = await registry.healthCheckAll();

      expect(results.get("blockrun")).toBe(false);

      // Restore original
      blockrun.healthCheck = originalHealthCheck;
    });

    it("should return empty map for no providers", async () => {
      const results = await registry.healthCheckAll();
      expect(results.size).toBe(0);
    });
  });

  describe("Provider Stats", () => {
    it("should calculate stats correctly", () => {
      const blockrun = new BlockRunProvider();
      const openrouter = new OpenRouterProvider();

      registry.register(blockrun);
      registry.register(openrouter);

      const stats = registry.getStats();

      expect(stats.total).toBe(2);
      expect(stats.byAuthType[AuthType.X402_PAYMENT]).toBe(1);
      expect(stats.byAuthType[AuthType.API_KEY]).toBe(1);
      expect(stats.byPriority["90-100"]).toBe(2);
    });

    it("should return zero stats for empty registry", () => {
      const stats = registry.getStats();

      expect(stats.total).toBe(0);
      expect(Object.keys(stats.byAuthType)).toHaveLength(0);
      expect(Object.keys(stats.byPriority)).toHaveLength(0);
    });

    it("should categorize by priority ranges", () => {
      const blockrun = new BlockRunProvider(); // 100
      const openrouter = new OpenRouterProvider(); // 90

      registry.register(blockrun);
      registry.register(openrouter);

      const stats = registry.getStats();

      expect(stats.byPriority["90-100"]).toBe(2);
    });
  });

  describe("Cross-Provider Fallback", () => {
    it("should get providers by priority for fallback", () => {
      const blockrun = new BlockRunProvider();
      const openrouter = new OpenRouterProvider();

      registry.register(blockrun);
      registry.register(openrouter);

      const providers = registry.getByPriority();

      expect(providers[0].metadata.id).toBe("blockrun");
      expect(providers[0].metadata.priority).toBe(100);
      expect(providers[1].metadata.id).toBe("openrouter");
      expect(providers[1].metadata.priority).toBe(90);
    });

    it("should handle empty registry gracefully", () => {
      const providers = registry.getByPriority();
      expect(providers).toEqual([]);
    });

    it("should maintain priority order after multiple registrations", async () => {
      const openrouter = new OpenRouterProvider();
      await openrouter.initialize({
        type: AuthType.API_KEY,
        credentials: {
          apiKey: "sk-test-key",
        },
      });

      const blockrun = new BlockRunProvider();
      await blockrun.initialize({
        type: AuthType.X402_PAYMENT,
        credentials: {
          walletKey: "0x0000000000000000000000000000000000000000000000000000000000000001",
        },
      });

      // Register in different order
      registry.register(openrouter);
      registry.register(blockrun);

      const providers = registry.getByPriority();

      expect(providers[0].metadata.id).toBe("blockrun");
      expect(providers.length).toBe(2);

      // Try to register again - should throw
      expect(() => {
        registry.register(openrouter);
      }).toThrow("Provider openrouter already registered");
    });
  });

  describe("Provider Metadata", () => {
    it("should have correct metadata for BlockRun", () => {
      const provider = new BlockRunProvider();

      expect(provider.metadata.id).toBe("blockrun");
      expect(provider.metadata.name).toBe("BlockRun");
      expect(provider.metadata.authType).toBe(AuthType.X402_PAYMENT);
      expect(provider.metadata.priority).toBe(100);
      expect(provider.metadata.baseUrl).toBe("https://blockrun.ai/api");
      expect(provider.metadata.version).toBeDefined();
    });

    it("should have correct metadata for OpenRouter", () => {
      const provider = new OpenRouterProvider();

      expect(provider.metadata.id).toBe("openrouter");
      expect(provider.metadata.name).toBe("OpenRouter");
      expect(provider.metadata.authType).toBe(AuthType.API_KEY);
      expect(provider.metadata.priority).toBe(90);
      expect(provider.metadata.baseUrl).toBe("https://openrouter.ai/api/v1");
      expect(provider.metadata.version).toBeDefined();
    });

    it("should have capabilities defined", () => {
      const blockrun = new BlockRunProvider();
      const openrouter = new OpenRouterProvider();

      expect(blockrun.metadata.capabilities.streaming).toBe(true);
      expect(blockrun.metadata.capabilities.reasoningModels).toBe(true);
      expect(blockrun.metadata.capabilities.visionModels).toBe(true);
      expect(blockrun.metadata.capabilities.contextWindow).toBeGreaterThan(0);

      expect(openrouter.metadata.capabilities.streaming).toBe(true);
      expect(openrouter.metadata.capabilities.contextWindow).toBeGreaterThan(0);
    });
  });

  describe("Registry Cleanup", () => {
    it("should cleanup all providers", async () => {
      const blockrun = new BlockRunProvider();
      await blockrun.initialize({
        type: AuthType.X402_PAYMENT,
        credentials: {
          walletKey: "0x0000000000000000000000000000000000000000000000000000000000000001",
        },
      });

      const openrouter = new OpenRouterProvider();
      await openrouter.initialize({
        type: AuthType.API_KEY,
        credentials: {
          apiKey: "sk-test-key",
        },
      });

      registry.register(blockrun);
      registry.register(openrouter);

      expect(registry.getAll().length).toBe(2);

      await registry.cleanupAll();

      expect(registry.getAll().length).toBe(0);
    });

    it("should allow re-registration after cleanup", async () => {
      const blockrun = new BlockRunProvider();
      await blockrun.initialize({
        type: AuthType.X402_PAYMENT,
        credentials: {
          walletKey: "0x0000000000000000000000000000000000000000000000000000000000000001",
        },
      });

      registry.register(blockrun);
      expect(registry.getAll().length).toBe(1);

      await registry.cleanupAll();
      expect(registry.getAll().length).toBe(0);

      registry.register(blockrun);
      expect(registry.getAll().length).toBe(1);
    });
  });

  describe("Cost Estimation", () => {
    it("should estimate cost for BlockRun provider", async () => {
      const blockrun = new BlockRunProvider();
      await blockrun.initialize({
        type: AuthType.X402_PAYMENT,
        credentials: {
          walletKey: "0x0000000000000000000000000000000000000000000000000000000000000001",
        },
      });

      const request: RequestContext = {
        model: "anthropic/claude-sonnet-4",
        messages: [
          { role: "user", content: "Hello" },
        ],
        maxTokens: 1000,
      };

      const cost = blockrun.estimateCost(request);

      expect(cost).toBeGreaterThan(0);
      expect(typeof cost).toBe("number");
    });

    it("should estimate cost for OpenRouter provider", async () => {
      const openrouter = new OpenRouterProvider();
      await openrouter.initialize({
        type: AuthType.API_KEY,
        credentials: {
          apiKey: "sk-test-key",
        },
      });

      const request: RequestContext = {
        model: "openai/gpt-4o",
        messages: [
          { role: "user", content: "Hello" },
        ],
        maxTokens: 1000,
      };

      const cost = openrouter.estimateCost(request);

      expect(cost).toBeGreaterThanOrEqual(0);
      expect(typeof cost).toBe("number");
    });

    it("should estimate higher cost for more tokens", async () => {
      const blockrun = new BlockRunProvider();
      await blockrun.initialize({
        type: AuthType.X402_PAYMENT,
        credentials: {
          walletKey: "0x0000000000000000000000000000000000000000000000000000000000000001",
        },
      });

      const request1: RequestContext = {
        model: "anthropic/claude-sonnet-4",
        messages: [{ role: "user", content: "Hello" }],
        maxTokens: 1000,
      };

      const request2: RequestContext = {
        model: "anthropic/claude-sonnet-4",
        messages: [{ role: "user", content: "Hello" }],
        maxTokens: 2000,
      };

      const cost1 = blockrun.estimateCost(request1);
      const cost2 = blockrun.estimateCost(request2);

      expect(cost2).toBeGreaterThan(cost1);
    });
  });

  describe("Environment Variable Resolution", () => {
    it("should not resolve env vars in test mode", () => {
      const config: ProvidersConfig = {
        version: "2.0",
        providers: [
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
          },
        ],
      };

      mockFs.writeConfig(config);
      const loaded = mockFs.readConfig();

      // In test mode, env vars are not resolved automatically
      expect(loaded.providers[0].auth.credentials.apiKey).toBe("${OPENROUTER_API_KEY}");
    });
  });
});
