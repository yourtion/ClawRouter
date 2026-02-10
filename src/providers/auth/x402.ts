/**
 * x402 Payment Authentication Strategy
 *
 * Adapts the existing x402 payment implementation into the new
 * authentication strategy interface.
 */

import type { IAuthStrategy, AuthRefreshResult } from "./types.js";
import type { AuthType } from "../types.js";
import type { RequestContext } from "../types.js";
import { createPaymentFetch, type PaymentFetchResult } from "../../x402.js";

export interface X402Options {
  walletKey: `0x${string}`;
  paymentFetch?: PaymentFetchResult;
}

export class X402AuthStrategy implements IAuthStrategy {
  readonly type: AuthType = "x402_payment" as AuthType;

  private walletKey: `0x${string}`;
  private paymentFetch?: PaymentFetchResult;

  constructor(options: X402Options) {
    this.walletKey = options.walletKey;
    this.paymentFetch = options.paymentFetch;
  }

  async initialize(credentials: Record<string, unknown>): Promise<void> {
    if (credentials.walletKey && typeof credentials.walletKey === "string") {
      this.walletKey = credentials.walletKey as `0x${string}`;
    }

    // Create payment fetch wrapper (uses existing x402.ts implementation)
    this.paymentFetch = createPaymentFetch(this.walletKey);
  }

  async prepareHeaders(request: RequestContext): Promise<Record<string, string>> {
    // x402 authentication doesn't use static headers
    // The payment signature is added dynamically during the fetch
    // via the paymentFetch wrapper

    return {
      "user-agent": "openclaw-router/v2.0",
    };
  }

  async handleAuthFailure(error: { statusCode: number; headers: Headers }): Promise<AuthRefreshResult> {
    if (error.statusCode === 402) {
      // x402 payment flow handles 402 automatically via paymentFetch
      // This is just a notification hook
      return {
        success: true,
        retryable: true,
      };
    }

    return {
      success: false,
      retryable: false,
      error: `Unhandled auth error: ${error.statusCode}`,
    };
  }

  async validateCredentials(): Promise<boolean> {
    // Validate wallet key format
    return /^0x[0-9a-fA-F]{64}$/.test(this.walletKey);
  }

  async cleanup(): Promise<void> {
    // No state to clean up
  }

  /**
   * Get the payment fetch wrapper for use in requests
   */
  getPaymentFetch(): PaymentFetchResult | undefined {
    return this.paymentFetch;
  }
}
