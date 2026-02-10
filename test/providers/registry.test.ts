/**
 * Provider Registry Tests
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { ProviderRegistry } from "../src/providers/registry.js";
import { BlockRunProvider } from "../src/providers/implementations/blockrun.js";
import { OpenRouterProvider } from "../src/providers/implementations/openrouter.js";
import type { IProvider } from "../src/providers/types.js";

// Mock provider for testing
class MockProvider implements IProvider {
  readonly metadata = {
    id: "mock",
    name: "Mock Provider",
    version: "1.0.0",
    baseUrl: "http://mock",
    authType: "api_key" as any,
    capabilities: {
      streaming: false,
      reasoningModels: false,
      visionModels: false,
      contextWindow: 128000,
    },
    priority: 50,
  };

  async initialize(): Promise<void> {}
  async getModels(): Promise<any[]> { return []; }
  isModelAvailable(): boolean { return true; }
  async execute(): Promise<any> { return { success: true, data: {} }; }
  estimateCost(): number { return 0; }
  async healthCheck(): Promise<boolean> { return true; }
  async cleanup(): Promise<void> {}
}

describe("ProviderRegistry", () => {
  let registry: ProviderRegistry;

  beforeEach(() => {
    registry = ProviderRegistry.getInstance();
    registry.cleanupAll(); // Clear any existing providers
  });

  it("should register a provider", () => {
    const provider = new MockProvider();
    registry.register(provider);

    expect(registry.get("mock")).toBe(provider);
  });

  it("should throw on duplicate registration", () => {
    const provider1 = new MockProvider();
    const provider2 = new MockProvider();

    registry.register(provider1);

    expect(() => registry.register(provider2)).toThrow();
  });

  it("should get all providers", () => {
    const provider1 = new MockProvider();
    const provider2 = new MockProvider();

    // Modify metadata for second provider
    (provider2 as any).metadata.id = "mock2";

    registry.register(provider1);
    registry.register(provider2);

    const all = registry.getAll();
    expect(all).toHaveLength(2);
  });

  it("should sort providers by priority", async () => {
    const provider1 = new MockProvider();
    (provider1 as any).metadata.id = "low";
    (provider1 as any).metadata.priority = 10;

    const provider2 = new MockProvider();
    (provider2 as any).metadata.id = "high";
    (provider2 as any).metadata.priority = 100;

    registry.register(provider1);
    registry.register(provider2);

    const sorted = registry.getByPriority();
    expect(sorted[0].metadata.id).toBe("high");
    expect(sorted[1].metadata.id).toBe("low");
  });

  it("should get stats", () => {
    const provider1 = new MockProvider();
    (provider1 as any).metadata.id = "p1";
    (provider1 as any).metadata.priority = 90;

    const provider2 = new MockProvider();
    (provider2 as any).metadata.id = "p2";
    (provider2 as any).metadata.priority = 70;

    registry.register(provider1);
    registry.register(provider2);

    const stats = registry.getStats();
    expect(stats.total).toBe(2);
    expect(stats.byPriority["70-89"]).toBe(1);
    expect(stats.byPriority["90-100"]).toBe(1);
  });
});

describe("BlockRunProvider", () => {
  it("should have correct metadata", () => {
    const provider = new BlockRunProvider();
    expect(provider.metadata.id).toBe("blockrun");
    expect(provider.metadata.authType).toBe("x402_payment");
    expect(provider.metadata.priority).toBe(100);
  });
});

describe("OpenRouterProvider", () => {
  it("should have correct metadata", () => {
    const provider = new OpenRouterProvider();
    expect(provider.metadata.id).toBe("openrouter");
    expect(provider.metadata.authType).toBe("api_key");
    expect(provider.metadata.priority).toBe(90);
  });
});
