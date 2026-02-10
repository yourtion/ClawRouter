/**
 * x402 Payment - DEPRECATED
 *
 * x402 blockchain payment removed - this is a stub for backward compatibility.
 * Returns standard fetch wrapper with user-agent header.
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

/**
 * Create payment fetch wrapper
 * DEPRECATED: Returns standard fetch with user-agent header
 */
export function createPaymentFetch(_privateKey: `0x${string}`): PaymentFetchResult {
  const payFetch = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const headers = new Headers(init?.headers);
    headers.set("user-agent", "openclaw-router/v2.0");

    return fetch(input, { ...init, headers });
  };

  return { fetch: payFetch };
}
