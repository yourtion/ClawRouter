/**
 * API Key Authentication Strategy
 *
 * Handles traditional API key authentication for providers
 * like OpenRouter, NVIDIA, etc.
 */

import type { IAuthStrategy, AuthRefreshResult } from "./types.js";
import type { AuthType } from "../types.js";
import type { RequestContext } from "../types.js";

export interface ApiKeyOptions {
  apiKey: string;
  headerName?: string;              // Default: "Authorization"
  headerPrefix?: string;            // Default: "Bearer "
  additionalHeaders?: Record<string, string>;
}

export class ApiKeyAuthStrategy implements IAuthStrategy {
  readonly type: AuthType = "api_key" as AuthType;

  private apiKey: string = "";
  private headerName: string;
  private headerPrefix: string;
  private additionalHeaders: Record<string, string>;

  constructor(options: ApiKeyOptions) {
    this.apiKey = options.apiKey;
    this.headerName = options.headerName || "Authorization";
    this.headerPrefix = options.headerPrefix || "Bearer ";
    this.additionalHeaders = options.additionalHeaders || {};
  }

  async initialize(credentials: Record<string, unknown>): Promise<void> {
    if (credentials.apiKey && typeof credentials.apiKey === "string") {
      this.apiKey = credentials.apiKey;
    }

    if (!this.apiKey) {
      throw new Error("API key is required for API key authentication");
    }
  }

  async prepareHeaders(request: RequestContext): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
      ...this.additionalHeaders,
    };

    headers[this.headerName] = `${this.headerPrefix}${this.apiKey}`;

    // Add common headers for OpenRouter
    if (this.headerName === "Authorization") {
      headers["HTTP-Referer"] = "https://openclaw.dev";
      headers["X-Title"] = "OpenClaw";
    }

    return headers;
  }

  async validateCredentials(): Promise<boolean> {
    // Basic validation: API key should not be empty
    return this.apiKey.length > 0;
  }

  async cleanup(): Promise<void> {
    // No state to clean up for API key auth
  }
}
