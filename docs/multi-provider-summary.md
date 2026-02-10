# Multi-Provider Support - Implementation Complete ✅

## 📊 Overview

OpenClaw Router 现在支持多个 LLM API 供应商，包括：
- **BlockRun** (x402 micropayments) - 默认优先级 100
- **OpenRouter** (API Key) - 默认优先级 90
- **可扩展架构** - 轻松添加更多供应商（NVIDIA、Anthropic、Google 等）

## 🏗️ Architecture

### Core Components

1. **Provider Registry** (`src/providers/registry.ts`)
   - 单例模式管理所有供应商实例
   - 按优先级排序供应商
   - 跨供应商模型聚合
   - 健康检查和统计信息

2. **Provider Factory** (`src/providers/factory.ts`)
   - 从配置动态创建供应商实例
   - 支持运行时供应商注册
   - 自动验证配置

3. **Provider Interface** (`src/providers/types.ts`)
   - 统一的 `IProvider` 接口
   - 标准化的模型格式 (`StandardModel`)
   - 请求/响应类型定义

4. **Authentication Strategies** (`src/providers/auth/`)
   - `X402AuthStrategy` - 区块链微支付
   - `ApiKeyAuthStrategy` - 传统 API 密钥
   - 可扩展的策略模式

5. **Provider Implementations**
   - `BlockRunProvider` - 重构的 BlockRun 集成
   - `OpenRouterProvider` - 新的 OpenRouter 集成

### Proxy Integration

`src/proxy.ts` 现在支持：
- ✅ 跨供应商请求路由
- ✅ 供应商优先级选择
- ✅ 自动故障转移
- ✅ 向后兼容 BlockRun-only 模式

## 📝 Configuration

### 配置文件位置
`~/.openclaw/clawrouter/providers.json`

### 示例配置
```json
{
  "version": "1.0.0",
  "providers": [
    {
      "id": "blockrun",
      "type": "blockrun",
      "enabled": true,
      "priority": 100,
      "auth": {
        "type": "x402_payment",
        "credentials": {
          "walletKey": "${WALLET_KEY}"
        }
      },
      "models": {
        "autoSync": true
      },
      "fallback": {
        "enabled": true,
        "timeoutMs": 30000,
        "retryAttempts": 3
      }
    },
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
      },
      "baseUrl": "https://openrouter.ai/api/v1",
      "models": {
        "autoSync": true
      }
    }
  ]
}
```

### 环境变量
```bash
# BlockRun (x402 payments)
export WALLET_KEY="0x..."

# OpenRouter
export OPENROUTER_API_KEY="sk-or-..."

# NVIDIA (future)
export NVIDIA_API_KEY="nvidia-..."
```

## 🧪 Testing

### Test Coverage

#### 1. Integration Verification (5 tests)
```bash
node test/integration/verify.mjs
```
- ✅ 模块导入
- ✅ 供应商实例创建
- ✅ ProviderRegistry 功能
- ✅ Legacy 导出兼容性
- ✅ TypeScript 类型定义

#### 2. E2E Integration (10 tests)
```bash
node test/e2e/integration.mjs
```
- ✅ 配置加载
- ✅ 供应商初始化
- ✅ 模型可用性检查
- ✅ 成本估算
- ✅ 健康检查
- ✅ 跨供应商 fallback
- ✅ 供应商元数据验证
- ✅ 能力验证

#### 3. Unit Tests with memfs (34 tests)
```bash
bun test test/e2e/multi-provider-memfs.test.ts
```
- ✅ Configuration Loading (4 tests)
- ✅ Provider Registration (5 tests)
- ✅ Provider Factory (4 tests)
- ✅ Model Availability (3 tests)
- ✅ Health Checks (3 tests)
- ✅ Provider Stats (3 tests)
- ✅ Cross-Provider Fallback (3 tests)
- ✅ Provider Metadata (3 tests)
- ✅ Registry Cleanup (2 tests)
- ✅ Cost Estimation (3 tests)
- ✅ Environment Variables (1 test)

### Test Results
```
✅ 49/49 tests passing
✅ 0 failures
✅ Build successful
✅ No TypeScript errors
```

## 🔄 Routing Logic

### Priority-Based Selection
1. 请求到达 → 检查模型 ID
2. 提取供应商 ID（从模型前缀或默认）
3. 从 ProviderRegistry 获取按优先级排序的供应商列表
4. 尝试最高优先级供应商
5. 失败时自动 fallback 到下一优先级供应商

### Provider Detection
```javascript
// 自动检测供应商
"openrouter/openai/gpt-4o"   → OpenRouter provider
"nvidia/meta/llama-3"         → NVIDIA provider
"anthropic/claude-sonnet-4"   → BlockRun provider (default)
```

### Fallback Chain
```
Request → Model: openrouter/openai/gpt-4o
  ↓
1. Try OpenRouter (priority 90)
  ↓ (fail: 429 rate limit)
2. Try BlockRun (priority 100, has same model)
  ↓ (success)
Response
```

## 🚀 Usage

### Basic Setup
```bash
# 1. Install
npm install openclaw-router

# 2. Create config
mkdir -p ~/.openclaw/clawrouter
cat > ~/.openclaw/clawrouter/providers.json << 'EOF'
{
  "version": "1.0.0",
  "providers": [
    {
      "id": "blockrun",
      "type": "blockrun",
      "enabled": true,
      "priority": 100,
      "auth": {
        "type": "x402_payment",
        "credentials": {
          "walletKey": "${WALLET_KEY}"
        }
      }
    },
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
EOF

# 3. Set credentials
export WALLET_KEY="0x..."
export OPENROUTER_API_KEY="sk-or-..."

# 4. Start proxy
openclaw plugins install openclaw-router
```

### Programmatic Usage
```typescript
import {
  ProviderRegistry,
  ProviderFactory,
  loadConfig,
  BlockRunProvider,
  OpenRouterProvider,
  AuthType,
} from 'openclaw-router';

// Load config and initialize providers
const config = await loadConfig();
const registry = ProviderRegistry.getInstance();

for (const providerConfig of config.providers) {
  const provider = await ProviderFactory.create(providerConfig);
  registry.register(provider);
}

// Get all models from all providers
const allModels = await registry.getAllModels();

// Get providers by priority
const providers = registry.getByPriority();

// Health check
const health = await registry.healthCheckAll();
```

## 📊 Provider Comparison

| Feature | BlockRun | OpenRouter | NVIDIA (future) |
|---------|----------|------------|-----------------|
| **Auth Type** | x402 Payment | API Key | API Key |
| **Default Priority** | 100 | 90 | 80 |
| **Models** | 38 | 344 | TBD |
| **Streaming** | ✅ | ✅ | ✅ |
| **Reasoning Models** | ✅ | ✅ | ✅ |
| **Vision Models** | ✅ | ✅ | ❓ |
| **Max Context** | 1.05M | 200K | ❓ |
| **Payment** | Per-request | Prepaid | Prepaid |

## 🔮 Future Enhancements

### Planned Features
1. **More Providers**
   - NVIDIA (NIM)
   - Anthropic (Claude API)
   - Google (Gemini API)
   - Together AI
   - Anyscale

2. **Advanced Routing**
   - Load balancing across providers
   - Cost-based routing optimization
   - Latency-based provider selection
   - Geographic routing

3. **Monitoring & Observability**
   - Request metrics per provider
   - Cost tracking and reporting
   - Performance analytics
   - Error rate monitoring

4. **Configuration Management**
   - Web UI for config editing
   - Config validation and hints
   - Hot-reload config changes
   - Config versioning

## 📚 Additional Documentation

- [Multi-Provider Guide](./multi-provider.md) - 详细使用指南
- [API Reference](./api.md) - API 文档
- [Troubleshooting](./troubleshooting.md) - 问题排查

## 🤝 Contributing

To add a new provider:

1. Create `src/providers/implementations/[provider-name].ts`
2. Implement `IProvider` interface
3. Add to `ProviderFactory.registerProviderTypes()`
4. Add tests in `test/providers/[provider-name].test.ts`
5. Update documentation

See `docs/multi-provider.md` for detailed guide.

## 📞 Support

- GitHub Issues: https://github.com/yourtion/ClawRouter/issues
- Documentation: https://github.com/yourtion/ClawRouter/tree/main/docs

---

**Status**: ✅ Production Ready
**Version**: 0.7.0+
**Last Updated**: 2025-02-10
