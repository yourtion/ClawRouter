/**
 * Payment Cache - Stub for API Key Authentication
 *
 * x402 payment removed - caching disabled.
 */

export type CachedPaymentParams = {
  payTo: string;
  amount: bigint;
  signature: string;
  expires: number;
};

export class PaymentCache {
  private cache = new Map<string, CachedPaymentParams>();

  get(_endpoint: string): CachedPaymentParams | undefined {
    return undefined;
  }

  set(_endpoint: string, _params: CachedPaymentParams): void {
    // No-op
  }

  clear(): void {
    this.cache.clear();
  }
}
