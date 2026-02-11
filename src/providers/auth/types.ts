/**
 * Authentication Strategy Interface
 *
 * Defines the contract for different authentication methods
 * (API key, OAuth, etc.)
 */

import type { AuthType } from "../types.js";
import type { RequestContext } from "../types.js";

/**
 * Authentication refresh result
 */
export interface AuthRefreshResult {
  success: boolean;
  retryable: boolean;
  newHeaders?: Record<string, string>;
  error?: string;
}

/**
 * Authentication strategy interface
 */
export interface IAuthStrategy {
  readonly type: AuthType;

  /** Initialize authentication with credentials */
  initialize(credentials: Record<string, unknown>): Promise<void>;

  /** Prepare request headers for authentication */
  prepareHeaders(request: RequestContext): Promise<Record<string, string>>;

  /** Handle authentication failure (401/402) */
  handleAuthFailure?(
    error: { statusCode: number; headers: Headers }
  ): Promise<AuthRefreshResult>;

  /** Validate credentials */
  validateCredentials(): Promise<boolean>;

  /** Cleanup authentication state */
  cleanup(): Promise<void>;
}
