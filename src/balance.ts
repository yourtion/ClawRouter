/**
 * Balance Monitor - Stub for API Key Authentication
 *
 * x402 payment removed - balance checks disabled.
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

export class BalanceMonitor {
  constructor(public readonly walletAddress: string) {}

  async checkBalance(): Promise<BalanceInfo> {
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
    // No-op
  }

  invalidate(): void {
    // No-op
  }
}
