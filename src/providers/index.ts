/**
 * Multi-Provider Support
 *
 * Exports all provider-related functionality for external use.
 */

// Core types and interfaces
export {
  IProvider,
  ProviderConfig,
  ProvidersConfig,
  ProviderMetadata,
  StandardModel,
  RequestContext,
  ProviderResponse,
  BalanceInfo,
  AuthConfig,
  AuthType,
} from "./types.js";

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
export {
  IAuthStrategy,
  AuthRefreshResult,
  ApiKeyAuthStrategy,
  X402AuthStrategy,
} from "./auth/index.js";

export type { ApiKeyOptions } from "./auth/api-key.js";
export type { X402Options } from "./auth/x402.js";
