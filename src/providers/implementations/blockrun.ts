/**
 * BlockRun Provider Implementation
 *
 * Refactors the existing BlockRun provider to use the new IProvider interface.
 * Uses x402 micropayment authentication.
 */

import type {
  IProvider,
  ProviderMetadata,
  StandardModel,
  RequestContext,
  ProviderResponse,
  AuthConfig,
  ProviderBalanceInfo,
} from "../types.js";
import { AuthType } from "../types.js";
import { X402AuthStrategy } from "../auth/x402.js";
import { BLOCKRUN_MODELS } from "../../models.js";
import { BalanceMonitor } from "../../balance.js";
import type { ProxyHandle } from "../../proxy.js";
import type { PaymentFetchResult } from "../../x402.js";

export interface BlockRunOptions {
  walletKey: `0x${string}`;
  proxyHandle?: ProxyHandle;
  paymentFetch?: PaymentFetchResult;
}

export class BlockRunProvider implements IProvider {
  readonly metadata: ProviderMetadata = {
    id: "blockrun",
    name: "BlockRun",
    version: "2.0.0",
    description: "x402 micropayments, 30+ models",
    docsUrl: "https://blockrun.ai/docs",
    baseUrl: "https://blockrun.ai/api",
    authType: AuthType.X402_PAYMENT,
    capabilities: {
      streaming: true,
      reasoningModels: true,
      visionModels: true,
      contextWindow: 1_050_000, // Gemini 2.5 Pro
    },
    priority: 100, // Highest priority by default
  };

  private authStrategy?: X402AuthStrategy;
  private balanceMonitor?: BalanceMonitor;
  private proxyHandle?: ProxyHandle;
  private models: StandardModel[] = [];

  constructor(options?: BlockRunOptions) {
    if (options?.proxyHandle) {
      this.proxyHandle = options.proxyHandle;
      // Update baseUrl to point to local proxy
      this.metadata.baseUrl = options.proxyHandle.baseUrl;
    }
  }

  async initialize(config: AuthConfig): Promise<void> {
    // Initialize x402 authentication
    const walletKey = config.credentials.walletKey as `0x${string}`;
    if (!walletKey) {
      throw new Error("BlockRun requires a wallet key for x402 authentication");
    }

    this.authStrategy = new X402AuthStrategy({
      walletKey,
      paymentFetch: config.credentials.paymentFetch as PaymentFetchResult,
    });

    await this.authStrategy.initialize(config.credentials);

    // Initialize balance monitor
    if (walletKey) {
      // Import viem functions dynamically
      const { privateKeyToAccount } = await import("viem/accounts");
      const account = privateKeyToAccount(walletKey);
      this.balanceMonitor = new BalanceMonitor(account.address);
    }

    // Convert existing BlockRun models to standard format
    this.models = BLOCKRUN_MODELS.map((m) => this.convertToStandardModel(m));

    console.log(`[BlockRunProvider] Initialized with ${this.models.length} models`);
  }

  async getModels(): Promise<StandardModel[]> {
    return this.models;
  }

  isModelAvailable(modelId: string): boolean {
    // Check with or without "blockrun/" prefix
    const normalizedId = modelId.replace(/^blockrun\//, "");
    return this.models.some((m) => m.id === normalizedId || m.id === modelId);
  }

  async execute(request: RequestContext): Promise<ProviderResponse> {
    if (!this.authStrategy) {
      throw new Error("Provider not initialized");
    }

    const startTime = Date.now();

    try {
      // Normalize model ID (remove "blockrun/" prefix if present)
      const normalizedModel = request.model.replace(/^blockrun\//, "");

      // Check balance
      if (this.balanceMonitor) {
        const estimatedCost = this.estimateCost({
          ...request,
          model: normalizedModel,
        });

        const estimatedCostMicros = BigInt(Math.ceil(estimatedCost * 1_000_000));
        const sufficiency = await this.balanceMonitor.checkSufficient(estimatedCostMicros);

        if (!sufficiency.sufficient) {
          return {
            success: false,
            error: {
              code: "INSUFFICIENT_FUNDS",
              message: `Insufficient balance: ${sufficiency.info.balanceUSD}`,
              statusCode: 402,
              retryable: false,
            },
          };
        }
      }

      // Prepare request
      const headers = await this.authStrategy.prepareHeaders(request);
      const paymentFetch = this.authStrategy.getPaymentFetch();

      // Determine URL (use proxy if available, otherwise direct to BlockRun API)
      const baseUrl = this.proxyHandle?.baseUrl || this.metadata.baseUrl;
      const url = `${baseUrl}/v1/chat/completions`;

      // Build request body
      const requestBody = this.buildRequestBody({
        ...request,
        model: normalizedModel,
      });

      // Execute request with payment fetch
      const fetchFn = paymentFetch?.fetch || fetch;

      const response = await fetchFn(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...headers,
        },
        body: JSON.stringify(requestBody),
      });

      const latencyMs = Date.now() - startTime;

      if (!response.ok) {
        // Try to handle auth failure
        if (this.authStrategy.handleAuthFailure) {
          const refreshResult = await this.authStrategy.handleAuthFailure({
            statusCode: response.status,
            headers: response.headers,
          });

          if (refreshResult.retryable) {
            // Retry once
            const retryResponse = await fetchFn(url, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                ...headers,
                ...(refreshResult.newHeaders || {}),
              },
              body: JSON.stringify(requestBody),
            });

            if (retryResponse.ok) {
              const data = await retryResponse.json();
              return {
                success: true,
                data,
                metadata: {
                  model: request.model,
                  tokensUsed: data.usage,
                  cost: this.estimateCost(request),
                  latencyMs: Date.now() - startTime,
                },
              };
            }
          }
        }

        return {
          success: false,
          error: {
            code: `HTTP_${response.status}`,
            message: await response.text(),
            statusCode: response.status,
            retryable: [401, 402, 429, 500, 502, 503].includes(response.status),
          },
        };
      }

      const data = await response.json();

      return {
        success: true,
        data,
        metadata: {
          model: data.model || request.model,
          tokensUsed: data.usage,
          cost: this.estimateCost(request),
          latencyMs,
        },
      };
    } catch (err) {
      return {
        success: false,
        error: {
          code: "NETWORK_ERROR",
          message: err instanceof Error ? err.message : String(err),
          statusCode: 500,
          retryable: true,
        },
      };
    }
  }

  async checkBalance(estimatedCost?: number): Promise<ProviderBalanceInfo> {
    if (!this.balanceMonitor) {
      return {
        available: false,
        balance: "0",
        currency: "USD",
        lowBalance: false,
        isEmpty: false,
        sufficient: false,
      };
    }

    const info = await this.balanceMonitor.checkBalance();

    const sufficient = estimatedCost
      ? info.balanceUSDNumber >= estimatedCost
      : true;

    return {
      available: true,
      balance: info.balanceUSD,
      balanceNumber: info.balanceUSDNumber,
      currency: "USD",
      lowBalance: info.isLow,
      isEmpty: info.isEmpty,
      sufficient,
    };
  }

  estimateCost(request: RequestContext): number {
    const model = this.models.find((m) =>
      m.id === request.model || m.id === request.model.replace(/^blockrun\//, "")
    );

    if (!model) return 0;

    const estimatedInputTokens = this.estimateTokens(request);
    const estimatedOutputTokens = request.maxTokens || 4096;

    return (
      (estimatedInputTokens / 1_000_000) * model.cost.input +
      (estimatedOutputTokens / 1_000_000) * model.cost.output
    );
  }

  async healthCheck(): Promise<boolean> {
    try {
      const url = this.proxyHandle
        ? `${this.proxyHandle.baseUrl}/health`
        : `${this.metadata.baseUrl}/health`;

      const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
      return response.ok;
    } catch {
      return false;
    }
  }

  async cleanup(): Promise<void> {
    await this.authStrategy?.cleanup();
  }

  /**
   * Convert BlockRun model to standard format
   */
  private convertToStandardModel(blockrunModel: {
    id: string;
    name: string;
    inputPrice: number;
    outputPrice: number;
    contextWindow: number;
    maxOutput: number;
    reasoning?: boolean;
    vision?: boolean;
    agentic?: boolean;
  }): StandardModel {
    return {
      id: blockrunModel.id,
      providerId: this.metadata.id,
      name: blockrunModel.name,
      api: "openai-completions",
      reasoning: blockrunModel.reasoning || false,
      input: blockrunModel.vision ? ["text", "image"] : ["text"],
      cost: {
        input: blockrunModel.inputPrice,
        output: blockrunModel.outputPrice,
        cacheRead: 0,
        cacheWrite: 0,
      },
      contextWindow: blockrunModel.contextWindow,
      maxTokens: blockrunModel.maxOutput,
      capabilities: blockrunModel.agentic ? ["agentic"] : undefined,
    };
  }

  private buildRequestBody(request: RequestContext): Record<string, unknown> {
    return {
      model: request.model,
      messages: request.messages,
      max_tokens: request.maxTokens,
      temperature: request.temperature,
      stream: request.stream || false,
      ...(request.tools && { tools: request.tools }),
    };
  }

  private estimateTokens(request: RequestContext): number {
    // Simple estimation: ~4 characters per token
    const content = JSON.stringify(request.messages);
    return Math.ceil(content.length / 4);
  }
}
