/**
 * x402 Payment - Stub for API Key Authentication
 *
 * x402 blockchain payment removed - returns standard fetch.
 */

export type PreAuthParams = {
  estimatedAmount: bigint;
  payToAddress: string;
};

export type PaymentFetchResult = {
  fetch: (
    input: RequestInfo | URL,
    init?: RequestInit,
  ) => Promise<Response>;
};

export function createPaymentFetch(_privateKey: `0x${string}`): PaymentFetchResult {
  return {
    fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      headers.set("user-agent", "openclaw-router/v2.0");
      return fetch(input, { ...init, headers });
    },
  };
}
