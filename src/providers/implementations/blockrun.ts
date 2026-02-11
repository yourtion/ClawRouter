/**
 * BlockRun Provider Implementation
 *
 * Uses API key authentication.
 * No wallet or payment signing is required.
 */

import type {
  IProvider,
  ProviderMetadata,
  StandardModel,
  RequestContext,
  ProviderResponse,
  AuthConfig,
} from "../types.js";
import { AuthType } from "../types.js";
import { ApiKeyAuthStrategy } from "../auth/api-key.js";
import { BLOCKRUN_MODELS } from "../../models.js";

export interface BlockRunOptions {
  apiKey: string;
}

export class BlockRunProvider implements IProvider {
  readonly metadata: ProviderMetadata = {
    id: "blockrun",
    name: "BlockRun",
    version: "2.0.0",
    description: "API key authentication, 30+ models",
    docsUrl: "https://blockrun.ai/docs",
    baseUrl: "https://blockrun.ai/api",
    authType: AuthType.API_KEY,
    capabilities: {
      streaming: true,
      reasoningModels: true,
      visionModels: true,
      contextWindow: 1_050_000, // Gemini 2.5 Pro
    },
    priority: 100, // Highest priority by default
  };

  private authStrategy?: ApiKeyAuthStrategy;
  private models: StandardModel[] = [];

  constructor(options?: BlockRunOptions) {
    if (options?.apiKey) {
      this.authStrategy = new ApiKeyAuthStrategy({ apiKey: options.apiKey });
    }
  }

  async initialize(config: AuthConfig): Promise<void> {
    // Initialize API key authentication
    const apiKey = config.credentials.apiKey as string;
    if (!apiKey) {
      throw new Error("BlockRun requires an API key for authentication");
    }

    this.authStrategy = new ApiKeyAuthStrategy({ apiKey });
    await this.authStrategy.initialize(config.credentials);

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

      // Prepare request with API key auth
      const headers = await this.authStrategy?.prepareHeaders(request) || {};

      // Build URL
      const url = `${this.metadata.baseUrl}/v1/chat/completions`;

      // Build request body
      const requestBody = this.buildRequestBody({
        ...request,
        model: normalizedModel,
      });

      // Execute request
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...headers,
        },
        body: JSON.stringify(requestBody),
      });

      const latencyMs = Date.now() - startTime;

      if (!response.ok) {
        return {
          success: false,
          error: {
            code: `HTTP_${response.status}`,
            message: await response.text(),
            statusCode: response.status,
            retryable: [401, 429, 500, 502, 503].includes(response.status),
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
      const url = `${this.metadata.baseUrl}/health`;

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
