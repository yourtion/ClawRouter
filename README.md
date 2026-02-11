<div align="center">

Route every request to the cheapest model that can handle it.
30+ models, API key authentication, smart routing.

[![npm](https://img.shields.io/npm/v/openclaw-router.svg)](https://npmjs.com/package/openclaw-router)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://typescriptlang.org)
[![Node](https://img.shields.io/badge/node-%E2%89%A520-brightgreen.svg)](https://nodejs.org)

[Configuration](docs/configuration.md) &middot; [Features](docs/features.md) &middot; [Troubleshooting](docs/troubleshooting.md)

</div>

---

```
"What is 2+2?"            → DeepSeek        $0.27/M    saved 99%
"Summarize this article"  → GPT-4o-mini     $0.60/M    saved 99%
"Build a React component" → Claude Sonnet   $15.00/M   best balance
"Prove this theorem"      → DeepSeek-R      $0.42/M    reasoning
"Run 50 parallel searches"→ Kimi K2.5       $2.40/M    agentic swarm
```

## Why ClawRouter?

- **100% local routing** — 15-dimension weighted scoring runs on your machine in <1ms
- **Zero external calls** — no API calls for routing decisions, ever
- **30+ models** — OpenAI, Anthropic, Google, DeepSeek, xAI, Moonshot through API key auth
- **API key authentication** — simple, secure, standard API key authentication
- **Open source** — MIT licensed, fully inspectable routing logic

### Ask Your OpenClaw How ClawRouter Saves You Money

<img src="docs/clawrouter-savings.png" alt="ClawRouter savings explanation" width="600">

---

## Quick Start (2 mins)

```bash
# 1. Install with smart routing enabled by default
npm install -g openclaw-router

# 2. Configure API keys in ~/.openclaw/clawrouter/providers.json
# Example: {"providers": [{"id": "openrouter", "enabled": true, "priority": 100, "auth": {"type": "api_key", "credentials": {"apiKey": "your-api-key"}}}]}

# 3. Restart OpenClaw gateway
openclaw gateway restart
```

Done! Smart routing is now your default model.

### Tips

- **Free tier?** Use `/model free` — routes to gpt-oss-120b at $0
- **Model aliases:** `/model sonnet`, `/model grok`, `/model deepseek`, `/model kimi`
- **Configure providers:** Edit `~/.openclaw/clawrouter/providers.json` to add API keys

---

## See It In Action

<div align="center">
<img src="assets/telegram-demo.png" alt="ClawRouter in action via Telegram" width="500"/>
</div>

**The flow:**

1. **Configure API keys** in `~/.openclaw/clawrouter/providers.json`
2. **Request any model** — "help me call Grok to check @hosseeb's opinion on AI agents"
3. **ClawRouter routes it** — spawns a Grok sub-agent via `xai/grok-3`, uses API key auth

Simple API key authentication.

---

## How Routing Works

**100% local, <1ms, zero API calls.**

```
Request → Weighted Scorer (15 dimensions)
              │
              ├── High confidence → Pick model from tier → Done
              │
              └── Low confidence → Default to MEDIUM tier → Done
```

No external classifier calls. Ambiguous queries default to the MEDIUM tier (DeepSeek/GPT-4o-mini) — fast, cheap, and good enough for most tasks.

**Deep dive:** [15-dimension scoring weights](docs/configuration.md#scoring-weights) | [Architecture](docs/architecture.md)

### Tier → Model Mapping

| Tier      | Primary Model         | Cost/M | Savings vs Opus |
| --------- | --------------------- | ------ | --------------- |
| SIMPLE    | gemini-2.5-flash      | $0.60  | **99.2%**       |
| MEDIUM    | grok-code-fast-1      | $1.50  | **98.0%**       |
| COMPLEX   | gemini-2.5-pro        | $10.00 | **86.7%**       |
| REASONING | grok-4-fast-reasoning | $0.50  | **99.3%**       |

Special rule: 2+ reasoning markers → REASONING at 0.97 confidence.

### Advanced Features

ClawRouter v0.5+ includes intelligent features that work automatically:

- **Agentic auto-detect** — routes multi-step tasks to Kimi K2.5
- **Tool detection** — auto-switches when `tools` array present
- **Context-aware** — filters models that can't handle your context size
- **Model aliases** — `/model free`, `/model sonnet`, `/model grok`
- **Session persistence** — pins model for multi-turn conversations

**Full details:** [docs/features.md](docs/features.md)

### Cost Savings

| Tier                | % of Traffic | Cost/M      |
| ------------------- | ------------ | ----------- |
| SIMPLE              | ~45%         | $0.27       |
| MEDIUM              | ~35%         | $0.60       |
| COMPLEX             | ~15%         | $15.00      |
| REASONING           | ~5%          | $10.00      |
| **Blended average** |              | **$3.17/M** |

Compared to **$75/M** for Claude Opus = **96% savings** on a typical workload.

---

## Models

30+ models across 6 providers:

| Model                 | Input $/M | Output $/M | Context | Reasoning |
| --------------------- | --------- | ---------- | ------- | :-------: |
| **OpenAI**            |           |            |         |           |
| gpt-5.2               | $1.75     | $14.00     | 400K    |    \*     |
| gpt-4o                | $2.50     | $10.00     | 128K    |           |
| gpt-4o-mini           | $0.15     | $0.60      | 128K    |           |
| gpt-oss-120b          | **$0**    | **$0**     | 128K    |           |
| o3                    | $2.00     | $8.00      | 200K    |    \*     |
| o3-mini               | $1.10     | $4.40      | 128K    |    \*     |
| **Anthropic**         |           |            |         |           |
| claude-opus-4.5       | $5.00     | $25.00     | 200K    |    \*     |
| claude-sonnet-4       | $3.00     | $15.00     | 200K    |    \*     |
| claude-haiku-4.5      | $1.00     | $5.00      | 200K    |           |
| **Google**            |           |            |         |           |
| gemini-2.5-pro        | $1.25     | $10.00     | 1M      |    \*     |
| gemini-2.5-flash      | $0.15     | $0.60      | 1M      |           |
| **DeepSeek**          |           |            |         |           |
| deepseek-chat         | $0.14     | $0.28      | 128K    |           |
| deepseek-reasoner     | $0.55     | $2.19      | 128K    |    \*     |
| **xAI**               |           |            |         |           |
| grok-3                | $3.00     | $15.00     | 131K    |    \*     |
| grok-3-mini           | $0.30     | $0.50      | 131K    |           |
| grok-4-fast-reasoning | $0.20     | $0.50      | 131K    |    \*     |
| grok-4-fast           | $0.20     | $0.50      | 131K    |           |
| grok-code-fast-1      | $0.20     | $1.50      | 131K    |           |
| **Moonshot**          |           |            |         |           |
| kimi-k2.5             | $0.50     | $2.40      | 262K    |    \*     |

> **Free tier:** `gpt-oss-120b` costs nothing and serves as free model option.

Full list: [`src/models.ts`](src/models.ts)

### Kimi K2.5: Agentic Workflows

[Kimi K2.5](https://kimi.ai) from Moonshot AI is optimized for agent swarm and multi-step workflows:

- **Agent Swarm** — Coordinates up to 100 parallel agents, 4.5x faster execution
- **Extended Tool Chains** — Stable across 200-300 sequential tool calls without drift
- **Vision-to-Code** — Generates production React from UI mockups and videos
- **Cost Efficient** — 76% cheaper than Claude Opus on agentic benchmarks

Best for: parallel web research, multi-agent orchestration, long-running automation tasks.

---

## Provider Configuration

Configure providers in `~/.openclaw/clawrouter/providers.json`:

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

**Full reference:** [Provider configuration](docs/configuration.md#provider-configuration)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Your Application                         │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   ClawRouter (localhost)                     │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────┐ │
│  │ Weighted Scorer │→ │ Model Selector  │→ │ API Key Auth│ │
│  │  (15 dimensions)│  │ (cheapest tier) │  │             │ │
│  └─────────────────┘  └─────────────────┘  └─────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      Provider APIs                           │
│    → OpenAI | Anthropic | Google | DeepSeek | xAI | Moonshot│
└─────────────────────────────────────────────────────────────┘
```

Routing is **client-side** — open source and inspectable.

**Deep dive:** [docs/architecture.md](docs/architecture.md) — request flow, authentication, optimizations

---

## Configuration

For basic usage, minimal configuration needed. For advanced options:

| Setting               | Default | Description           |
| --------------------- | ------- | --------------------- |
| `CLAWROUTER_DISABLED` | `false` | Disable smart routing |
| `CLAWROUTER_PROXY_PORT` | `8402`  | Proxy port            |

**Full reference:** [docs/configuration.md](docs/configuration.md)

---

## Programmatic Usage

Use ClawRouter directly in your code:

```typescript
import { startProxy, route } from "openclaw-router";

// Start proxy server
const proxy = await startProxy({});

// Or use router directly (no proxy)
const decision = route("Prove sqrt(2) is irrational", ...);
```

**Full examples:** [docs/configuration.md#programmatic-usage](docs/configuration.md#programmatic-usage)

---

## Performance Optimizations

- **SSE heartbeat**: Sends headers + heartbeat immediately, preventing upstream timeouts
- **Response dedup**: SHA-256 hash → 30s cache, prevents duplicate requests on retries

---

## Cost Tracking

Track your savings with `/stats` in any OpenClaw conversation.

**Full details:** [docs/features.md#cost-tracking-with-stats](docs/features.md#cost-tracking-with-stats)

---

## Why Not OpenRouter / LiteLLM?

They're built for developers. ClawRouter is built for **agents**.

|             | OpenRouter / LiteLLM        | ClawRouter                       |
| ----------- | --------------------------- | -------------------------------- |
| **Setup**   | Human creates account       | Simple config file               |
| **Auth**    | API key (shared secret)     | API key (standard)               |
| **Routing** | Proprietary / closed        | Open source, client-side         |

ClawRouter provides transparent, open-source routing that agents can understand and control.

---

## Troubleshooting

Quick checklist:

```bash
# Check version (should be 0.5.7+)
cat ~/.openclaw/extensions/clawrouter/package.json | grep version

# Check proxy running
curl http://localhost:8402/health
```

**Full guide:** [docs/troubleshooting.md](docs/troubleshooting.md)

---

## Development

```bash
git clone https://github.com/yourtion/ClawRouter.git
cd ClawRouter
npm install
npm run build
npm run typecheck

# Run tests
npm run test:resilience:quick
```

---

## Roadmap

- [x] Smart routing — 15-dimension weighted scoring, 4-tier model selection
- [x] API key authentication — simple, secure authentication
- [x] Response dedup — prevents duplicate requests on retries
- [x] SSE heartbeat — prevents upstream timeouts
- [x] Agentic auto-detect — auto-switch to agentic models for multi-step tasks
- [x] Tool detection — auto-switch to agentic mode when tools array present
- [x] Context-aware routing — filter out models that can't handle context size
- [x] Session persistence — pin model for multi-turn conversations
- [x] Cost tracking — /stats command with savings dashboard
- [x] Model aliases — `/model free`, `/model sonnet`, `/model grok`, etc.
- [x] Multi-provider support — OpenRouter, NVIDIA, etc.
- [ ] Cascade routing — try cheap model first, escalate on low quality
- [ ] Spend controls — daily/monthly budgets
- [ ] Remote analytics — cost tracking dashboard

---

## License

MIT

---

<div align="center">

If ClawRouter saves you money, consider starring the repo.

</div>
