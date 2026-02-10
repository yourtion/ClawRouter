/**
 * Multi-Provider Support - Core Type Definitions
 *
 * Defines interfaces and types for supporting multiple LLM providers
 * (BlockRun, OpenRouter, NVIDIA, etc.) with different authentication methods.
 */

/**
 * Supported authentication types
 */
export enum AuthType {
  API_KEY = "api_key",               // Traditional API key (BlockRun, OpenRouter, NVIDIA)
  OAUTH = "oauth",                   // OAuth 2.0 (future)
  BEARER_TOKEN = "bearer_token",     // Bearer token (future)
  NONE = "none",                     // No authentication (future)
}

/**
 * Provider capabilities
 */
export interface ProviderCapabilities {
  streaming: boolean;                // Supports streaming responses
  reasoningModels: boolean;          // Has reasoning models
  visionModels: boolean;             // Has vision/multimodal models
  contextWindow: number;             // Maximum context window
  rateLimiting?: {
    requestsPerMinute?: number;
    tokensPerMinute?: number;
  };
}

/**
 * Standardized model definition across providers
 */
export interface StandardModel {
  id: string;                        // Unique ID (e.g., "openai/gpt-4o")
  providerId: string;                // Provider ID (e.g., "blockrun")
  name: string;                      // Display name
  api?: "openai-completions" | "openai-responses" | "anthropic-messages" | "google-generative-ai";
  reasoning: boolean;                // Is reasoning model
  input: Array<"text" | "image">;   // Input types
  cost: {                            // Cost in USD per 1M tokens
    input: number;
    output: number;
    cacheRead?: number;
    cacheWrite?: number;
  };
  contextWindow: number;             // Context window size
  maxTokens: number;                 // Max output tokens
  capabilities?: string[];           // Additional capabilities
}

/**
 * Provider metadata
 */
export interface ProviderMetadata {
  id: string;                        // Unique identifier
  name: string;                      // Display name
  version: string;                   // Implementation version
  description?: string;              // Description
  docsUrl?: string;                  // Documentation URL
  baseUrl: string;                   // API base URL
  authType: AuthType;                // Primary auth type
  capabilities: ProviderCapabilities;
  priority: number;                  // Priority for routing (higher = preferred)
}

/**
 * Authentication configuration
 */
export interface AuthConfig {
  type: AuthType;
  credentials: Record<string, unknown>;
  priority?: number;                 // For fallback strategies
}

/**
 * Request context
 */
export interface RequestContext {
  model: string;                     // Target model
  messages: Array<{role: string; content: unknown}>;
  maxTokens?: number;
  temperature?: number;
  stream?: boolean;
  tools?: unknown[];
  sessionId?: string;                // For session persistence
}

/**
 * Provider response
 */
export interface ProviderResponse {
  success: boolean;
  data?: unknown;                     // Response data
  error?: {
    code: string;
    message: string;
    statusCode: number;
    retryable: boolean;              // Can retry
  };
  metadata?: {
    model: string;
    tokensUsed?: {input: number; output: number};
    cost?: number;
    latencyMs: number;
  };
}

/**
 * Balance information (for providers with billing)
 */
export interface ProviderBalanceInfo {
  available: boolean;                // Is available
  balance: string;                   // Balance in smallest unit (e.g., USDC micros)
  balanceNumber?: number;            // Balance in standard unit (e.g., USD)
  currency: string;                  // Currency code
  lowBalance: boolean;               // Is low balance
  isEmpty: boolean;                  // Is empty
  sufficient: boolean;               // Is sufficient (requires cost estimate)
}

/**
 * Provider interface - Core contract for all providers
 */
export interface IProvider {
  /** Provider metadata */
  readonly metadata: ProviderMetadata;

  /** Initialize provider with auth config */
  initialize(config: AuthConfig): Promise<void>;

  /** Get available models */
  getModels(): Promise<StandardModel[]>;

  /** Check if model is available */
  isModelAvailable(modelId: string): boolean;

  /** Execute request */
  execute(request: RequestContext): Promise<ProviderResponse>;

  /** Check balance (if applicable) */
  checkBalance?(estimatedCost?: number): Promise<ProviderBalanceInfo>;

  /** Estimate request cost */
  estimateCost(request: RequestContext): number;

  /** Health check */
  healthCheck(): Promise<boolean>;

  /** Cleanup resources */
  cleanup(): Promise<void>;
}

/**
 * Provider configuration for loading from config file
 */
export interface ProviderConfig {
  id: string;                        // Provider ID
  type?: string;                     // Type identifier (optional, defaults to id)
  enabled: boolean;                  // Is enabled
  priority: number;                  // Priority (1-100, higher = preferred)
  auth: {
    type: AuthType;
    credentials: Record<string, unknown>;
  };
  baseUrl?: string;                  // Override default base URL
  headers?: Record<string, string>;  // Additional headers
  models?: {
    autoSync: boolean;               // Auto-sync model list
    customList?: string[];           // Manual model list
  };
  rateLimit?: {
    maxRequestsPerMinute?: number;
    maxConcurrent?: number;
  };
  fallback?: {
    enabled: boolean;
    timeoutMs: number;
    retryAttempts: number;
  };
}

/**
 * Provider registry configuration
 */
export interface ProvidersConfig {
  version: string;
  providers: ProviderConfig[];
}
