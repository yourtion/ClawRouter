/**
 * Provider Factory
 *
 * Creates provider instances from configuration.
 */

import type { IProvider } from "./types.js";
import type { ProviderConfig } from "./types.js";
import { BlockRunProvider } from "./implementations/blockrun.js";
import { OpenRouterProvider } from "./implementations/openrouter.js";

/**
 * Provider factory
 */
export class ProviderFactory {
  private static providerTypes = new Map<string, new (options?: unknown) => IProvider>([
    ["blockrun", BlockRunProvider],
    ["openrouter", OpenRouterProvider],
    // Future providers can be registered here
  ]);

  /**
   * Register a custom provider type
   */
  static registerType(id: string, impl: new (options?: unknown) => IProvider): void {
    this.providerTypes.set(id, impl);
  }

  /**
   * Create a provider from configuration
   */
  static async create(config: ProviderConfig): Promise<IProvider> {
    // Use config.type if provided, otherwise fall back to config.id
    const typeId = config.type || config.id;
    const ProviderClass = this.providerTypes.get(typeId);

    if (!ProviderClass) {
      throw new Error(`Unknown provider type: ${typeId}`);
    }

    const provider = new ProviderClass();

    // Initialize with auth config
    await provider.initialize({
      type: config.auth.type,
      credentials: config.auth.credentials,
    });

    return provider;
  }

  /**
   * Create multiple providers from configuration
   */
  static async createBatch(configs: ProviderConfig[]): Promise<IProvider[]> {
    const providers: IProvider[] = [];

    for (const config of configs) {
      if (!config.enabled) {
        console.log(`[ProviderFactory] Skipping disabled provider: ${config.id}`);
        continue;
      }

      try {
        const provider = await this.create(config);
        providers.push(provider);
      } catch (err) {
        console.error(`[ProviderFactory] Failed to create provider ${config.id}:`, err);
      }
    }

    return providers;
  }
}
