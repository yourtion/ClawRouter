/**
 * Multi-Provider Support
 *
 * Exports all provider-related functionality for external use.
 */

// Core types and interfaces
export type {
  IProvider,
  ProviderConfig,
  ProvidersConfig,
  ProviderMetadata,
  StandardModel,
  RequestContext,
  ProviderResponse,
  AuthConfig,
} from "./types.js";
export { AuthType } from "./types.js";

// Registry
export { ProviderRegistry } from "./registry.js";

// Factory
export { ProviderFactory } from "./factory.js";

// Configuration
export {
  loadConfig,
  saveConfig,
  getProviderConfigs,
  getExampleConfig,
} from "./config.js";

// Implementations
export { BlockRunProvider } from "./implementations/blockrun.js";
export { OpenRouterProvider } from "./implementations/openrouter.js";

// Authentication
export type { IAuthStrategy, AuthRefreshResult } from "./auth/types.js";
export { ApiKeyAuthStrategy } from "./auth/api-key.js";

export type { ApiKeyOptions } from "./auth/api-key.js";
