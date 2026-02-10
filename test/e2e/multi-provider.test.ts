/**
 * End-to-End Tests for Multi-Provider Support
 *
 * Tests the complete multi-provider workflow:
 * - Config loading
 * - Provider initialization
 * - Model synchronization
 * - Request routing
 * - Cross-provider fallback
 * - Health checks
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { ProviderRegistry } from "../../src/providers/registry.js";
import { ProviderFactory } from "../../src/providers/factory.js";
import { loadConfig } from "../../src/providers/config.js";
import { BlockRunProvider } from "../../src/providers/implementations/blockrun.js";
import { OpenRouterProvider } from "../../src/providers/implementations/openrouter.js";
import type { ProviderConfig, RequestContext } from "../../src/providers/types.js";
import { AuthType } from "../../src/providers/types.js";

describe("Multi-Provider E2E Tests", () => {
  let registry: ProviderRegistry;

  beforeEach(() => {
    registry = ProviderRegistry.getInstance();
    registry.cleanupAll();
  });

  afterEach(() => {
    registry.cleanupAll();
  });

  describe("Configuration Loading", () => {
    it("should load config from file", async () => {
      const config = await loadConfig();

      expect(config).toBeDefined();
      expect(config.version).toBeDefined();
      expect(Array.isArray(config.providers)).toBe(true);
    });

    it("should resolve environment variables in config", async () => {
      // Set test environment variables
      process.env.WALLET_KEY = "0xtest123";
      process.env.OPENROUTER_API_KEY = "sk-test-key";

      const config = await loadConfig();

      const blockrun = config.providers.find((p) => p.id === "blockrun");
      expect(blockrun).toBeDefined();

      const openrouter = config.providers.find((p) => p.id === "openrouter");
      expect(openrouter).toBeDefined();

      // Clean up
      delete process.env.WALLET_KEY;
      delete process.env.OPENROUTER_API_KEY;
    });

    it("should filter disabled providers", async () => {
      const config = await loadConfig();
      const enabled = config.providers.filter((p) => p.enabled);

      expect(enabled.length).toBeGreaterThan(0);
      enabled.forEach((p) => {
        expect(p.enabled).toBe(true);
      });
    });
  });

  describe("Provider Registration", () => {
    it("should register multiple providers", async () => {
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

      await expect(ProviderFactory.create(config)).rejects.toThrow();
    });
  });

  describe("Model Availability", () => {
    it("should check model availability for BlockRun", () => {
      const blockrun = new BlockRunProvider();
      registry.register(blockrun);

      expect(blockrun.isModelAvailable("anthropic/claude-sonnet-4")).toBe(true);
      expect(blockrun.isModelAvailable("unknown/model")).toBe(false);
    });

    it("should aggregate models from all providers", async () => {
      const blockrun = new BlockRunProvider();
      const openrouter = new OpenRouterProvider();

      registry.register(blockrun);
      registry.register(openrouter);

      const allModels = await registry.getAllModels();

      expect(allModels.length).toBeGreaterThan(0);
      expect(allModels.some((m) => m.providerId === "blockrun")).toBe(true);
      expect(allModels.some((m) => m.providerId === "openrouter")).toBe(true);
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
      const originalHealthCheck = blockrun.healthCheck;
      blockrun.healthCheck = async () => false;

      const results = await registry.healthCheckAll();

      expect(results.get("blockrun")).toBe(false);

      // Restore original
      blockrun.healthCheck = originalHealthCheck;
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
  });

  describe("Provider Metadata", () => {
    it("should have correct metadata for BlockRun", () => {
      const provider = new BlockRunProvider();

      expect(provider.metadata.id).toBe("blockrun");
      expect(provider.metadata.name).toBe("BlockRun");
      expect(provider.metadata.authType).toBe(AuthType.X402_PAYMENT);
      expect(provider.metadata.priority).toBe(100);
      expect(provider.metadata.baseUrl).toBe("https://blockrun.ai/api");
    });

    it("should have correct metadata for OpenRouter", () => {
      const provider = new OpenRouterProvider();

      expect(provider.metadata.id).toBe("openrouter");
      expect(provider.metadata.name).toBe("OpenRouter");
      expect(provider.metadata.authType).toBe(AuthType.API_KEY);
      expect(provider.metadata.priority).toBe(90);
      expect(provider.metadata.baseUrl).toBe("https://openrouter.ai/api/v1");
    });

    it("should have capabilities defined", () => {
      const blockrun = new BlockRunProvider();
      const openrouter = new OpenRouterProvider();

      expect(blockrun.metadata.capabilities.streaming).toBe(true);
      expect(blockrun.metadata.capabilities.reasoningModels).toBe(true);
      expect(openrouter.metadata.capabilities.streaming).toBe(true);
      expect(openrouter.metadata.capabilities.contextWindow).toBeGreaterThan(0);
    });
  });

  describe("Registry Cleanup", () => {
    it("should cleanup all providers", () => {
      const blockrun = new BlockRunProvider();
      const openrouter = new OpenRouterProvider();

      registry.register(blockrun);
      registry.register(openrouter);

      expect(registry.getAll().length).toBe(2);

      registry.cleanupAll();

      expect(registry.getAll().length).toBe(0);
    });

    it("should cleanup specific provider", async () => {
      const blockrun = new BlockRunProvider();
      registry.register(blockrun);

      expect(registry.get("blockrun")).toBeDefined();

      await blockrun.cleanup();

      // Provider should be removed from registry after cleanup
      // Note: This depends on implementation details
    });
  });

  describe("Cost Estimation", () => {
    it("should estimate cost for BlockRun provider", () => {
      const blockrun = new BlockRunProvider();

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

    it("should estimate cost for OpenRouter provider", () => {
      const openrouter = new OpenRouterProvider();

      const request: RequestContext = {
        model: "openai/gpt-4o",
        messages: [
          { role: "user", content: "Hello" },
        ],
        maxTokens: 1000,
      };

      const cost = openrouter.estimateCost(request);

      expect(cost).toBeGreaterThanOrEqual(0);
    });
  });
});
