/**
 * Provider Registry
 *
 * Manages multiple provider instances, handles priority-based selection,
 * and aggregates models across all providers.
 */

import type {
  IProvider,
  ProviderMetadata,
  StandardModel,
} from "./types.js";

/**
 * Provider registry - Singleton pattern
 */
export class ProviderRegistry {
  private static instance: ProviderRegistry;
  private providers = new Map<string, IProvider>();
  private metadata = new Map<string, ProviderMetadata>();
  private modelsCache = new Map<string, StandardModel[]>();
  private cacheExpiry = new Map<number, NodeJS.Timeout>();

  private constructor() {}

  static getInstance(): ProviderRegistry {
    if (!ProviderRegistry.instance) {
      ProviderRegistry.instance = new ProviderRegistry();
    }
    return ProviderRegistry.instance;
  }

  /**
   * Register a provider
   */
  register(provider: IProvider): void {
    const { id } = provider.metadata;

    if (this.providers.has(id)) {
      throw new Error(`Provider ${id} already registered`);
    }

    this.providers.set(id, provider);
    this.metadata.set(id, provider.metadata);

    console.log(`[ProviderRegistry] Registered provider: ${id} (priority: ${provider.metadata.priority})`);
  }

  /**
   * Unregister a provider
   */
  unregister(id: string): void {
    this.providers.delete(id);
    this.metadata.delete(id);
    this.modelsCache.delete(id);
    console.log(`[ProviderRegistry] Unregistered provider: ${id}`);
  }

  /**
   * Get provider by ID
   */
  get(id: string): IProvider | undefined {
    return this.providers.get(id);
  }

  /**
   * Get all providers
   */
  getAll(): IProvider[] {
    return Array.from(this.providers.values());
  }

  /**
   * Get enabled providers (all registered providers are considered enabled)
   */
  getEnabled(): IProvider[] {
    return this.getAll();
  }

  /**
   * Get providers sorted by priority (highest first)
   */
  getByPriority(): IProvider[] {
    return this.getAll().sort(
      (a, b) => b.metadata.priority - a.metadata.priority
    );
  }

  /**
   * Find providers that support a specific model
   */
  findProvidersForModel(modelId: string): IProvider[] {
    return this.getAll().filter((provider) =>
      provider.isModelAvailable(modelId)
    );
  }

  /**
   * Get all models from all providers (aggregated)
   */
  async getAllModels(): Promise<StandardModel[]> {
    const models: StandardModel[] = [];

    for (const [id, provider] of this.providers) {
      try {
        const providerModels = await provider.getModels();
        models.push(...providerModels);
      } catch (err) {
        console.error(`[ProviderRegistry] Failed to get models for ${id}:`, err);
      }
    }

    return models;
  }

  /**
   * Get models from a specific provider with caching
   */
  async getModelsFromProvider(providerId: string, ttlMs: number = 3600000): Promise<StandardModel[]> {
    const cached = this.modelsCache.get(providerId);
    if (cached) {
      return cached;
    }

    const provider = this.get(providerId);
    if (!provider) {
      throw new Error(`Provider ${providerId} not found`);
    }

    const models = await provider.getModels();
    this.modelsCache.set(providerId, models);

    // Clear cache after TTL
    const timeout = setTimeout(() => {
      this.modelsCache.delete(providerId);
    }, ttlMs);
    this.cacheExpiry.set(Date.now() + ttlMs, timeout);

    return models;
  }

  /**
   * Health check all providers
   */
  async healthCheckAll(): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>();

    await Promise.all(
      Array.from(this.providers.entries()).map(async ([id, provider]) => {
        try {
          const healthy = await provider.healthCheck();
          results.set(id, healthy);
        } catch {
          results.set(id, false);
        }
      })
    );

    return results;
  }

  /**
   * Get available providers (health check passed)
   */
  async getAvailable(): Promise<IProvider[]> {
    const healthResults = await this.healthCheckAll();
    const available: IProvider[] = [];

    for (const [id, healthy] of healthResults) {
      if (healthy) {
        const provider = this.get(id);
        if (provider) {
          available.push(provider);
        }
      }
    }

    return available;
  }

  /**
   * Get primary provider (highest priority that is available)
   */
  async getPrimary(): Promise<IProvider | undefined> {
    const available = await this.getAvailable();
    return available.sort((a, b) => b.metadata.priority - a.metadata.priority)[0];
  }

  /**
   * Clear model caches
   */
  clearCache(): void {
    this.modelsCache.clear();
    for (const timeout of this.cacheExpiry.values()) {
      clearTimeout(timeout);
    }
    this.cacheExpiry.clear();
  }

  /**
   * Cleanup all providers
   */
  async cleanupAll(): Promise<void> {
    this.clearCache();

    await Promise.all(
      Array.from(this.providers.values()).map((provider) =>
        provider.cleanup().catch((err) =>
          console.error(`Error cleaning up provider:`, err)
        )
      )
    );

    this.providers.clear();
    this.metadata.clear();
  }

  /**
   * Get registry statistics
   */
  getStats(): {
    total: number;
    byAuthType: Record<string, number>;
    byPriority: Record<string, number>;
  } {
    const providers = this.getAll();
    const byAuthType: Record<string, number> = {};
    const byPriority: Record<string, number> = {};

    for (const provider of providers) {
      const authType = provider.metadata.authType;
      byAuthType[authType] = (byAuthType[authType] || 0) + 1;

      const priority = provider.metadata.priority;
      const range = priority >= 90 ? "90-100" :
                    priority >= 70 ? "70-89" :
                    priority >= 50 ? "50-69" : "1-49";
      byPriority[range] = (byPriority[range] || 0) + 1;
    }

    return {
      total: providers.length,
      byAuthType,
      byPriority,
    };
  }
}
