# Multi-Provider Support

## Overview

OpenClaw Router now supports multiple LLM providers (OpenRouter, NVIDIA, etc.) with API key authentication.

## Architecture

### Key Components

1. **IProvider Interface** - Standardized contract for all providers
2. **ProviderRegistry** - Manages provider instances and priority-based selection
3. **Auth Strategies** - Pluggable authentication (API Key, OAuth)
4. **Provider Factory** - Creates providers from configuration
5. **Config Loader** - Loads provider settings from files/env vars

### Directory Structure

```
src/providers/
├── types.ts              # Core type definitions
├── registry.ts           # Provider registry
├── factory.ts            # Provider factory
├── config.ts             # Configuration loader
├── auth/
│   ├── types.ts          # Auth strategy interface
│   ├── api-key.ts        # API Key authentication
│   └── ...
└── implementations/
    ├── blockrun.ts       # BlockRun provider
    ├── openrouter.ts     # OpenRouter provider
    └── ...
```

## Configuration

### Config File Location

`~/.openclaw/clawrouter/providers.json`

### Example Configuration

```json
{
  "version": "2.0",
  "providers": [
    {
      "id": "openrouter",
      "type": "openrouter",
      "enabled": true,
      "priority": 100,
      "auth": {
        "type": "api_key",
        "credentials": {
          "apiKey": "${OPENROUTER_API_KEY}"
        }
      },
      "models": {
        "autoSync": true
      }
    },
    {
      "id": "nvidia",
      "type": "nvidia",
      "enabled": true,
      "priority": 90,
      "auth": {
        "type": "api_key",
        "credentials": {
          "apiKey": "${NVIDIA_API_KEY}"
        }
      },
      "models": {
        "autoSync": true
      }
    }
  ]
}
```

### Environment Variables

```bash
# OpenRouter (API Key)
export OPENROUTER_API_KEY="sk-or-..."

# NVIDIA (API Key)
export NVIDIA_API_KEY="nvapi-..."
```

## Provider Priority

Providers are selected based on `priority` value:
- **Higher number** = Higher priority (preferred)
- **100** = Default highest
- **1-100** = Custom providers

## Usage Examples

### Programmatic Usage

```typescript
import { ProviderRegistry, ProviderFactory, loadConfig } from "./providers/index.js";

// Load configuration
const config = await loadConfig();

// Create providers from config
const providers = await ProviderFactory.createBatch(config.providers);

// Register providers
const registry = ProviderRegistry.getInstance();
for (const provider of providers) {
  registry.register(provider);
}

// Get models from all providers
const allModels = await registry.getAllModels();

// Execute request with automatic fallback
const bestProvider = await registry.getPrimary();
const response = await bestProvider.execute({
  model: "openai/gpt-4o",
  messages: [{ role: "user", content: "Hello!" }],
});
```

### Adding a Custom Provider

```typescript
import { IProvider, ProviderMetadata, AuthType } from "./providers/index.js";

class CustomProvider implements IProvider {
  readonly metadata: ProviderMetadata = {
    id: "custom",
    name: "Custom Provider",
    version: "1.0.0",
    baseUrl: "https://api.example.com",
    authType: AuthType.API_KEY,
    capabilities: {
      streaming: true,
      reasoningModels: false,
      visionModels: false,
      contextWindow: 128000,
    },
    priority: 80,
  };

  async initialize(config: AuthConfig): Promise<void> {
    // Initialize with credentials
  }

  async getModels(): Promise<StandardModel[]> {
    // Return available models
  }

  isModelAvailable(modelId: string): boolean {
    // Check if model is available
  }

  async execute(request: RequestContext): Promise<ProviderResponse> {
    // Execute request
  }

  estimateCost(request: RequestContext): number {
    // Estimate cost
  }

  async healthCheck(): Promise<boolean> {
    // Health check
  }

  async cleanup(): Promise<void> {
    // Cleanup
  }
}

// Register the provider
import { ProviderFactory } from "./providers/index.js";
ProviderFactory.registerType("custom", CustomProvider);
```

## Migration Guide

### To Add OpenRouter

1. Set your API key:
```bash
export OPENROUTER_API_KEY="sk-or-..."
```

2. Add to your config file (`~/.openclaw/clawrouter/providers.json`):
```json
{
  "version": "2.0",
  "providers": [
    {
      "id": "openrouter",
      "type": "openrouter",
      "enabled": true,
      "priority": 90,
      "auth": {
        "type": "api_key",
        "credentials": {
          "apiKey": "${OPENROUTER_API_KEY}"
        }
      }
    }
  ]
}
```

3. Restart OpenClaw Router:
```bash
openclaw gateway restart
```

## Features

### Supported Providers

| Provider | Auth Type | Priority | Status |
|----------|-----------|----------|--------|
| OpenRouter | API Key | 100 | ✅ Stable |
| NVIDIA | API Key | 90 | ✅ Stable |

### Authentication Methods

- **API Key** - Traditional API keys (OpenRouter, NVIDIA)
- **OAuth 2.0** - Planned for future providers
- **Bearer Token** - Planned for future providers

### Advanced Features

- ✅ **Provider Priority** - Automatic selection based on priority
- ✅ **Health Checks** - Monitor provider availability
- ✅ **Model Caching** - Cache model lists (1 hour TTL)
- ✅ **Fallback** - Automatic fallback to next available provider
- 🚧 **Cost Optimization** - Cross-provider cost comparison (planned)
- 🚧 **Load Balancing** - Distribute requests across providers (planned)

## Troubleshooting

### Provider Not Showing Up

```bash
# Check provider status
openclaw providers status

# Test provider connection
openclaw providers test openrouter
```

### API Key Issues

```bash
# Verify environment variable is set
echo $OPENROUTER_API_KEY

# Check config file
cat ~/.openclaw/clawrouter/providers.json
```

### Model Not Found

Models must be prefixed with provider ID:
- ❌ `"openai/gpt-4o"`
- ✅ `"openrouter/openai/gpt-4o"`

## Development

### Running Tests

```bash
npm run test:resilience:quick
```

### Building

```bash
npm run build
```

### Type Checking

```bash
npm run typecheck
```

## Contributing

To add a new provider:

1. Create a new file in `src/providers/implementations/your-provider.ts`
2. Implement the `IProvider` interface
3. Add auth strategy if needed in `src/providers/auth/`
4. Register in `ProviderFactory`
5. Add tests
6. Update documentation

## License

MIT License - see LICENSE file for details
