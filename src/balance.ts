/**
 * Balance Monitor - DEPRECATED
 *
 * x402 payment removed - this is a stub for backward compatibility.
 * All balance checks return "sufficient" to allow API key auth to work.
 */

export const BALANCE_THRESHOLDS = {
  LOW_BALANCE_MICROS: 1_000_000n,
  ZERO_THRESHOLD: 100n,
} as const;

export type BalanceInfo = {
  balance: bigint;
  balanceUSD: string;
  balanceUSDNumber: number;
  isLow: boolean;
  isEmpty: boolean;
  walletAddress: string;
};

export type SufficiencyResult = {
  sufficient: boolean;
  info: BalanceInfo;
};

/**
 * Balance Monitor - Stub implementation (x402 payment removed)
 */
export class BalanceMonitor {
  constructor(public readonly walletAddress: string) {}

  async checkBalance(): Promise<BalanceInfo> {
    // Return default "sufficient" balance for API key authentication
    return {
      balance: 1000000000n,
      balanceUSD: "1000.00",
      balanceUSDNumber: 1000,
      isLow: false,
      isEmpty: false,
      walletAddress: this.walletAddress,
    };
  }

  async checkSufficient(_estimatedCostMicros: bigint): Promise<SufficiencyResult> {
    const info = await this.checkBalance();
    return {
      sufficient: true,
      info,
    };
  }

  deductEstimated(_amount: bigint): void {
    // No-op - balance tracking disabled
  }

  invalidate(): void {
    // No-op - balance cache disabled
  }
}
