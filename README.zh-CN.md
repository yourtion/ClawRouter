<div align="center">

将每个请求路由到能处理它的最便宜的模型。
30+ 模型，API 密钥认证，智能路由。

[![npm](https://img.shields.io/npm/v/openclaw-router.svg)](https://npmjs.com/package/openclaw-router)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://typescriptlang.org)
[![Node](https://img.shields.io/badge/node-%E2%89%A520-brightgreen.svg)](https://nodejs.org)

[配置](docs/configuration.md) • [功能](docs/features.md) • [故障排除](docs/troubleshooting.md)

</div>

---

```
"2+2等于多少？"           → DeepSeek        $0.27/M    节省 99%
"总结这篇文章"           → GPT-4o-mini     $0.60/M    节省 99%
"构建一个 React 组件"    → Claude Sonnet   $15.00/M   最佳平衡
"证明这个定理"           → DeepSeek-R      $0.42/M    推理
"并行运行 50 次搜索"     → Kimi K2.5       $2.40/M    智能体群
```

## 为什么选择 ClawRouter？

- **100% 本地路由** — 15 维加权评分在您的机器上 <1ms 内运行
- **零外部调用** — 路由决策绝不调用 API
- **30+ 模型** — OpenAI、Anthropic、Google、DeepSeek、xAI、Moonshot，通过 API 密钥认证
- **API 密钥认证** — 简单、安全、标准的 API 密钥认证
- **开源** — MIT 许可，路由逻辑完全可审查

---

## 快速开始（2 分钟）

```bash
# 1. 安装并默认启用智能路由
npm install -g openclaw-router

# 2. 在 ~/.openclaw/clawrouter/providers.json 中配置 API 密钥
# 示例: {"providers": [{"id": "openrouter", "enabled": true, "priority": 100, "auth": {"type": "api_key", "credentials": {"apiKey": "your-api-key"}}}]}

# 3. 重启 OpenClaw 网关
openclaw gateway restart
```

完成！智能路由现在是您的默认模型。

### 提示

- **免费层？** 使用 `/model free` — 路由到 gpt-oss-120b，费用为 $0
- **模型别名：** `/model sonnet`、`/model grok`、`/model deepseek`、`/model kimi`
- **配置提供商：** 编辑 `~/.openclaw/clawrouter/providers.json` 添加 API 密钥

---

## 查看实际效果

<div align="center">
<img src="assets/telegram-demo.png" alt="ClawRouter via Telegram 运行" width="500"/>
</div>

**流程：**

1. **在 `~/.openclaw/clawrouter/providers.json` 中配置 API 密钥**
2. **请求任何模型** — "帮我调用 Grok 查看 @hosseeb 对 AI 智能体的看法"
3. **ClawRouter 路由** — 通过 `xai/grok-3` 生成 Grok 子智能体，使用 API 密钥认证

简单的 API 密钥认证。

---

## 路由工作原理

**100% 本地，<1ms，零 API 调用。**

```
请求 → 加权评分器（15 维度）
              │
              ├── 高置信度 → 从层中选择模型 → 完成
              │
              └── 低置信度 → 默认为 MEDIUM 层 → 完成
```

无外部分类器调用。模糊查询默认为 MEDIUM 层（DeepSeek/GPT-4o-mini）—— 快速、便宜，对大多数任务来说足够好。

**深入了解：** [15 维评分权重](docs/configuration.md#scoring-weights) | [架构](docs/architecture.md)

### 层 → 模型映射

| 层级      | 主要模型              | 成本/M | vs Opus 节省 |
| --------- | --------------------- | ------ | ------------ |
| SIMPLE    | gemini-2.5-flash      | $0.60  | **99.2%**    |
| MEDIUM    | grok-code-fast-1      | $1.50  | **98.0%**    |
| COMPLEX   | gemini-2.5-pro        | $10.00 | **86.7%**    |
| REASONING | grok-4-fast-reasoning | $0.50  | **99.3%**    |

特殊规则：2+ 个推理标记 → 在 0.97 置信度下为 REASONING。

### 高级功能

ClawRouter v0.5+ 包含自动工作的智能功能：

- **智能体自动检测** — 将多步任务路由到 Kimi K2.5
- **工具检测** — 当 `tools` 数组存在时自动切换
- **上下文感知** — 过滤无法处理上下文大小的模型
- **模型别名** — `/model free`、`/model sonnet`、`/model grok`
- **会话持久化** — 为多轮对话固定模型

**完整详情：** [docs/features.md](docs/features.md)

### 成本节省

| 层级                | 流量占比 | 成本/M     |
| ------------------- | -------- | ---------- |
| SIMPLE              | ~45%     | $0.27      |
| MEDIUM              | ~35%     | $0.60      |
| COMPLEX             | ~15%     | $15.00     |
| REASONING           | ~5%      | $10.00     |
| **加权平均**        |          | **$3.17/M** |

与 Claude Opus 的 **$75/M** 相比 = **96% 节省**（典型工作负载）。

---

## 模型

6 个提供商共 30+ 个模型：

| 模型                  | 输入 $/M | 输出 $/M | 上下文 | 推理     |
| --------------------- | -------- | -------- | ------ | :------: |
| **OpenAI**            |          |          |        |          |
| gpt-5.2               | $1.75    | $14.00   | 400K   | *        |
| gpt-4o                | $2.50    | $10.00   | 128K   |          |
| gpt-4o-mini           | $0.15    | $0.60    | 128K   |          |
| gpt-oss-120b          | **$0**   | **$0**   | 128K   |          |
| o3                    | $2.00    | $8.00    | 200K   | *        |
| o3-mini               | $1.10    | $4.40    | 128K   | *        |
| **Anthropic**         |          |          |        |          |
| claude-opus-4.5       | $5.00    | $25.00   | 200K   | *        |
| claude-sonnet-4       | $3.00    | $15.00   | 200K   | *        |
| claude-haiku-4.5      | $1.00    | $5.00    | 200K   |          |
| **Google**            |          |          |        |          |
| gemini-2.5-pro        | $1.25    | $10.00   | 1M     | *        |
| gemini-2.5-flash      | $0.15    | $0.60    | 1M     |          |
| **DeepSeek**          |          |          |        |          |
| deepseek-chat         | $0.14    | $0.28    | 128K   |          |
| deepseek-reasoner     | $0.55    | $2.19    | 128K   | *        |
| **xAI**               |          |          |        |          |
| grok-3                | $3.00    | $15.00   | 131K   | *        |
| grok-3-mini           | $0.30    | $0.50    | 131K   |          |
| grok-4-fast-reasoning | $0.20    | $0.50    | 131K   | *        |
| grok-4-fast           | $0.20    | $0.50    | 131K   |          |
| grok-code-fast-1      | $0.20    | $1.50    | 131K   |          |
| **Moonshot**          |          |          |        |          |
| kimi-k2.5             | $0.50    | $2.40    | 262K   | *        |

> **免费层：** `gpt-oss-120b` 费用为 0，是免费模型选项。

完整列表：[`src/models.ts`](src/models.ts)

### Kimi K2.5：智能体工作流

来自 Moonshot AI 的 [Kimi K2.5](https://kimi.ai) 针对智能体群和多步工作流进行了优化：

- **智能体群** — 协调多达 100 个并行智能体，执行速度快 4.5 倍
- **扩展工具链** — 在 200-300 次顺序工具调用中保持稳定，无漂移
- **视觉到代码** — 从 UI 模型和视频生成生产级 React
- **成本高效** — 在智能体基准测试上比 Claude Opus 便宜 76%

最适合：并行网络研究、多智能体编排、长时间运行的自动化任务。

---

## 提供商配置

在 `~/.openclaw/clawrouter/providers.json` 中配置提供商：

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
      }
    }
  ]
}
```

**完整参考：** [提供商配置](docs/configuration.md#provider-configuration)

---

## 架构

```
┌─────────────────────────────────────────────────────────────┐
│                     您的应用程序                             │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   ClawRouter (localhost)                     │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────┐ │
│  │ 加权评分器      │→ │ 模型选择器      │→ │ API 密钥认证│ │
│  │  (15 维度)      │  │ (最便宜层)      │  │             │ │
│  └─────────────────┘  └─────────────────┘  └─────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      提供商 API                              │
│    → OpenAI | Anthropic | Google | DeepSeek | xAI | Moonshot│
└─────────────────────────────────────────────────────────────┘
```

路由是**客户端**的 — 开源且可审查。

**深入了解：** [docs/architecture.md](docs/architecture.md) — 请求流程、认证、优化

---

## 配置

对于基本用法，需要最少的配置。对于高级选项：

| 设置                   | 默认值  | 描述           |
| ---------------------- | ------- | -------------- |
| `CLAWROUTER_DISABLED`  | `false` | 禁用智能路由   |
| `CLAWROUTER_PROXY_PORT` | `8402`  | 代理端口       |

**完整参考：** [docs/configuration.md](docs/configuration.md)

---

## 编程使用

直接在代码中使用 ClawRouter：

```typescript
import { startProxy, route } from "openclaw-router";

// 启动代理服务器
const proxy = await startProxy({});

// 或直接使用路由器（无代理）
const decision = route("证明 sqrt(2) 是无理数", ...);
```

**完整示例：** [docs/configuration.md#programmatic-usage](docs/configuration.md#programmatic-usage)

---

## 性能优化

- **SSE 心跳**：立即发送头部 + 心跳，防止上游超时
- **响应去重**：SHA-256 哈希 → 30s 缓存，防止重试时的重复请求

---

## 成本追踪

在任何 OpenClaw 对话中使用 `/stats` 追踪您的节省。

**完整详情：** [docs/features.md#cost-tracking-with-stats](docs/features.md#cost-tracking-with-stats)

---

## 为什么不选择 OpenRouter / LiteLLM？

它们是为开发者构建的。ClawRouter 是为**智能体**构建的。

|              | OpenRouter / LiteLLM | ClawRouter                   |
| ----------- | -------------------- | ---------------------------- |
| **设置**     | 人类创建账户         | 简单的配置文件               |
| **认证**     | API 密钥（共享密钥） | API 密钥（标准）             |
| **路由**     | 专有 / 封闭          | 开源，客户端                 |

ClawRouter 提供透明、开源的路由，智能体可以理解和控制。

---

## 故障排除

快速检查清单：

```bash
# 检查版本（应为 0.5.7+）
cat ~/.openclaw/extensions/clawrouter/package.json | grep version

# 检查代理运行中
curl http://localhost:8402/health
```

**完整指南：** [docs/troubleshooting.md](docs/troubleshooting.md)

---

## 开发

```bash
git clone https://github.com/yourtion/ClawRouter.git
cd ClawRouter
npm install
npm run build
npm run typecheck

# 运行测试
npm run test:resilience:quick
```

---

## 路线图

- [x] 智能路由 — 15 维加权评分，4 层模型选择
- [x] API 密钥认证 — 简单、安全的认证
- [x] 响应去重 — 防止重试时的重复请求
- [x] SSE 心跳 — 防止上游超时
- [x] 智能体自动检测 — 自动切换到智能体模型进行多步任务
- [x] 工具检测 — 当工具数组存在时自动切换到智能体模式
- [x] 上下文感知路由 — 过滤无法处理上下文大小的模型
- [x] 会话持久化 — 为多轮对话固定模型
- [x] 成本追踪 — /stats 命令和节省仪表板
- [x] 模型别名 — `/model free`、`/model sonnet`、`/model grok` 等
- [x] 多提供商支持 — OpenRouter、NVIDIA 等
- [ ] 级联路由 — 先尝试便宜的模型，质量低时升级
- [ ] 支出控制 — 每日/每月预算
- [ ] 远程分析 — 成本追踪仪表板

---

## 许可证

MIT

---

<div align="center">

如果 ClawRouter 为您节省了资金，请给仓库点星。

</div>
