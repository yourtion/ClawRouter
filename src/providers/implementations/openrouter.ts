/**
 * OpenRouter Provider Implementation
 *
 * Implements support for OpenRouter (https://openrouter.ai)
 * Uses traditional API key authentication.
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

export interface OpenRouterOptions {
  apiKey: string;
  baseUrl?: string;
}

export class OpenRouterProvider implements IProvider {
  readonly metadata: ProviderMetadata = {
    id: "openrouter",
    name: "OpenRouter",
    version: "1.0.0",
    description: "Unified API for 100+ models",
    docsUrl: "https://openrouter.ai/docs",
    baseUrl: "https://openrouter.ai/api/v1",
    authType: AuthType.API_KEY,
    capabilities: {
      streaming: true,
      reasoningModels: true,
      visionModels: true,
      contextWindow: 200000, // GPT-4
    },
    priority: 90, // Lower than BlockRun by default
  };

  private authStrategy?: ApiKeyAuthStrategy;
  private models: StandardModel[] = [];

  constructor(options?: OpenRouterOptions) {
    if (options?.baseUrl) {
      this.metadata.baseUrl = options.baseUrl;
    }
  }

  async initialize(config: AuthConfig): Promise<void> {
    const apiKey = config.credentials.apiKey as string;
    if (!apiKey) {
      throw new Error("OpenRouter requires an API key");
    }

    this.authStrategy = new ApiKeyAuthStrategy({
      apiKey,
      headerName: "Authorization",
      headerPrefix: "Bearer ",
      additionalHeaders: {
        "HTTP-Referer": "https://openclaw.dev",
        "X-Title": "OpenClaw",
      },
    });

    await this.authStrategy.initialize(config.credentials);

    // Sync models from OpenRouter API
    await this.syncModels();

    console.log(`[OpenRouterProvider] Initialized with ${this.models.length} models`);
  }

  private async syncModels(): Promise<void> {
    try {
      const headers = this.authStrategy
        ? await this.authStrategy.prepareHeaders({} as RequestContext)
        : {};

      const response = await fetch(`${this.metadata.baseUrl}/models`, {
        headers,
        signal: AbortSignal.timeout(10000), // 10 second timeout
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch models: ${response.statusText}`);
      }

      const data = (await response.json()) as {
        data: Array<{
          id: string;
          name: string;
          context_length?: number;
          pricing?: {
            prompt?: number;
            completion?: number;
          };
        }>;
      };

      this.models = data.data.map((m) => this.convertToStandardModel(m));
    } catch (err) {
      console.error("[OpenRouterProvider] Failed to sync models:", err);
      // Start with empty models, will retry on next call
      this.models = [];
    }
  }

  async getModels(): Promise<StandardModel[]> {
    // Return cached models
    return this.models;
  }

  isModelAvailable(modelId: string): boolean {
    // Check with or without "openrouter/" prefix
    const normalizedId = modelId.replace(/^openrouter\//, "");
    return this.models.some((m) => m.id === normalizedId || m.id === modelId);
  }

  async execute(request: RequestContext): Promise<ProviderResponse> {
    if (!this.authStrategy) {
      throw new Error("Provider not initialized");
    }

    const startTime = Date.now();

    try {
      // Normalize model ID (remove "openrouter/" prefix if present)
      const normalizedModel = request.model.replace(/^openrouter\//, "");

      // Prepare headers
      const headers = await this.authStrategy.prepareHeaders(request);

      // Build request
      const url = `${this.metadata.baseUrl}/chat/completions`;
      const requestBody = this.buildRequestBody({
        ...request,
        model: normalizedModel,
      });

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

      // Extract cost from response headers (if available)
      const cost = this.extractCost(response);

      return {
        success: true,
        data,
        metadata: {
          model: data.model || request.model,
          tokensUsed: data.usage,
          cost,
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
      m.id === request.model || m.id === request.model.replace(/^openrouter\//, "")
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
      const headers = this.authStrategy
        ? await this.authStrategy.prepareHeaders({} as RequestContext)
        : {};

      const response = await fetch(`${this.metadata.baseUrl}/models`, {
        headers,
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async cleanup(): Promise<void> {
    await this.authStrategy?.cleanup();
  }

  private convertToStandardModel(openrouterModel: {
    id: string;
    name: string;
    context_length?: number;
    pricing?: {
      prompt?: number;
      completion?: number;
    };
  }): StandardModel {
    return {
      id: openrouterModel.id,
      providerId: this.metadata.id,
      name: openrouterModel.name,
      api: "openai-completions",
      reasoning: openrouterModel.id.includes("reasoning") ||
                openrouterModel.id.includes("o1") ||
                openrouterModel.id.includes("o3"),
      input: ["text", "image"], // Most models support vision
      cost: {
        input: openrouterModel.pricing?.prompt || 0,
        output: openrouterModel.pricing?.completion || 0,
        cacheRead: 0,
        cacheWrite: 0,
      },
      contextWindow: openrouterModel.context_length || 128000,
      maxTokens: 4096,
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

  private extractCost(response: Response): number {
    // OpenRouter returns cost in headers
    const promptCost = response.headers.get("x-prompt-cost");
    const completionCost = response.headers.get("x-completion-cost");

    if (promptCost && completionCost) {
      return parseFloat(promptCost) + parseFloat(completionCost);
    }

    return 0;
  }

  private estimateTokens(request: RequestContext): number {
    // Simple estimation: ~4 characters per token
    const content = JSON.stringify(request.messages);
    return Math.ceil(content.length / 4);
  }
}
