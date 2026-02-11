# Configuration Reference

Complete reference for OpenClaw Router configuration options.

## Table of Contents

- [Environment Variables](#environment-variables)
- [Proxy Settings](#proxy-settings)
- [Programmatic Usage](#programmatic-usage)
- [Routing Configuration](#routing-configuration)
- [Tier Overrides](#tier-overrides)
- [Scoring Weights](#scoring-weights)
- [Testing Configuration](#testing-configuration)

---

## Environment Variables

| Variable                | Default | Description                                         |
| ----------------------- | ------- | --------------------------------------------------- |
| `CLAWROUTER_PROXY_PORT` | `8402`  | Port for the local proxy server.                    |

### CLAWROUTER_PROXY_PORT

Configure the proxy to listen on a different port:

```bash
export CLAWROUTER_PROXY_PORT=8403
openclaw gateway restart
```

**Behavior:**

- If a proxy is already running on the configured port, OpenClaw Router will **reuse it** instead of failing with `EADDRINUSE`
- A warning is logged if the existing proxy uses a different configuration

**Valid values:** 1-65535 (integers only). Invalid values fall back to 8402.

---

## Proxy Settings

### Proxy Reuse (v0.4.1+)

OpenClaw Router automatically detects and reuses an existing proxy on startup:

```
Session 1: startProxy() → starts server on :8402
Session 2: startProxy() → detects existing, reuses handle
```

**Behavior:**

- Health check is performed on the configured port before starting
- If responsive, returns a handle that uses the existing proxy
- `close()` on reused handles is a no-op (doesn't stop the original server)
- Warning logged if existing proxy uses a different configuration

### Programmatic Usage

Use OpenClaw Router without OpenClaw:

```typescript
import { startProxy } from "openclaw-router";

const proxy = await startProxy({
  onReady: (port) => console.log(`Proxy on port ${port}`),
  onRouted: (d) => console.log(`${d.model} saved ${(d.savings * 100).toFixed(0)}%`),
});

// Any OpenAI-compatible client works
const res = await fetch(`${proxy.baseUrl}/v1/chat/completions`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    model: "auto",
    messages: [{ role: "user", content: "What is 2+2?" }],
  }),
});

await proxy.close();
```

Or use the router directly (no proxy):

```typescript
import { route, DEFAULT_ROUTING_CONFIG, BLOCKRUN_MODELS } from "openclaw-router";

// Build pricing map
const modelPricing = new Map();
for (const m of BLOCKRUN_MODELS) {
  modelPricing.set(m.id, { inputPrice: m.inputPrice, outputPrice: m.outputPrice });
}

const decision = route("Prove sqrt(2) is irrational", undefined, 4096, {
  config: DEFAULT_ROUTING_CONFIG,
  modelPricing,
});

console.log(decision);
// {
//   model: "deepseek/deepseek-reasoner",
//   tier: "REASONING",
//   confidence: 0.97,
//   method: "rules",
//   savings: 0.994,
//   costEstimate: 0.002,
// }
```

### Programmatic Options

All options for `startProxy()`:

```typescript
import { startProxy } from "openclaw-router";

const proxy = await startProxy({
  // Port configuration
  port: 8402, // Default: 8402 or CLAWROUTER_PROXY_PORT

  // Timeouts
  requestTimeoutMs: 180000, // 3 minutes

  // Callbacks
  onReady: (port) => console.log(`Proxy ready on ${port}`),
  onError: (error) => console.error(error),
  onRouted: (decision) => console.log(decision.model, decision.tier),

  // Routing config overrides
  routingConfig: {
    // See Routing Configuration below
  },
});
```

---

## Routing Configuration

### Via openclaw.yaml

```yaml
plugins:
  - id: "openclaw-router"
    config:
      routing:
        # Override tier assignments
        tiers:
          SIMPLE:
            primary: "google/gemini-2.5-flash"
            fallback: ["deepseek/deepseek-chat"]
          MEDIUM:
            primary: "deepseek/deepseek-chat"
            fallback: ["openai/gpt-4o-mini"]
          COMPLEX:
            primary: "anthropic/claude-sonnet-4"
            fallback: ["openai/gpt-4o"]
          REASONING:
            primary: "deepseek/deepseek-reasoner"
            fallback: ["openai/o3-mini"]

        # Override scoring parameters
        scoring:
          reasoningKeywords: ["prove", "theorem", "formal", "derive"]
          codeKeywords: ["function", "class", "async", "import"]
          simpleKeywords: ["what is", "define", "hello"]

        # Override thresholds
        classifier:
          confidenceThreshold: 0.7
          reasoningConfidence: 0.97

        # Context-based overrides
        overrides:
          largeContextTokens: 100000 # Force COMPLEX above this
          structuredOutput: true # Bump to min MEDIUM for JSON/YAML
```

---

## Tier Overrides

### Default Tier Mappings

| Tier      | Primary Model                | Fallback Chain                                  |
| --------- | ---------------------------- | ----------------------------------------------- |
| SIMPLE    | `google/gemini-2.5-flash`    | `deepseek/deepseek-chat`                        |
| MEDIUM    | `deepseek/deepseek-chat`     | `openai/gpt-4o-mini`, `google/gemini-2.5-flash` |
| COMPLEX   | `anthropic/claude-sonnet-4`  | `openai/gpt-4o`, `google/gemini-2.5-pro`        |
| REASONING | `deepseek/deepseek-reasoner` | `openai/o3-mini`, `anthropic/claude-sonnet-4`   |

### Fallback Chain

When the primary model fails (rate limits, billing errors, provider outages), OpenClaw Router tries the next model in the fallback chain:

```
Request → gemini-2.5-flash (rate limited)
       → deepseek-chat (billing error)
       → gpt-4o-mini (success)
```

Max fallback attempts: 3 models per request.

### Custom Tier Configuration

```yaml
routing:
  tiers:
    COMPLEX:
      primary: "openai/gpt-4o" # Use GPT-4o instead of Claude
      fallback:
        - "anthropic/claude-sonnet-4"
        - "google/gemini-2.5-pro"
```

---

## Scoring Weights

The 15-dimension weighted scorer determines query complexity:

| Dimension             | Weight | Detection                                |
| --------------------- | ------ | ---------------------------------------- |
| `reasoningMarkers`    | 0.18   | "prove", "theorem", "step by step"       |
| `codePresence`        | 0.15   | "function", "async", "import", "```"     |
| `multiStepPatterns`   | 0.12   | "first...then", "step 1", numbered lists |
| `agenticTask`         | 0.10   | "run", "test", "fix", "deploy", "edit"   |
| `technicalTerms`      | 0.10   | "algorithm", "kubernetes", "distributed" |
| `tokenCount`          | 0.08   | short (<50) vs long (>500)               |
| `creativeMarkers`     | 0.05   | "story", "poem", "brainstorm"            |
| `questionComplexity`  | 0.05   | Multiple question marks                  |
| `constraintCount`     | 0.04   | "at most", "O(n)", "maximum"             |
| `imperativeVerbs`     | 0.03   | "build", "create", "implement"           |
| `outputFormat`        | 0.03   | "json", "yaml", "schema"                 |
| `simpleIndicators`    | 0.02   | "what is", "define", "translate"         |
| `domainSpecificity`   | 0.02   | "quantum", "fpga", "genomics"            |
| `referenceComplexity` | 0.02   | "the docs", "the api", "above"           |
| `negationComplexity`  | 0.01   | "don't", "avoid", "without"              |

### Custom Keywords

```yaml
routing:
  scoring:
    # Add domain-specific reasoning triggers
    reasoningKeywords:
      - "prove"
      - "theorem"
      - "formal verification"
      - "type theory" # Custom

    # Add framework-specific code triggers
    codeKeywords:
      - "function"
      - "useEffect" # React-specific
      - "prisma" # ORM-specific
```

---

## Advanced: Confidence Calibration

The classifier uses sigmoid calibration to convert raw scores to confidence values:

```
confidence = 1 / (1 + exp(-k * (score - midpoint)))
```

Parameters:

- `k = 8` — steepness of the sigmoid curve
- `midpoint = 0.5` — score at which confidence = 50%

### Override Thresholds

```yaml
routing:
  classifier:
    # Require higher confidence for tier assignment
    confidenceThreshold: 0.8 # Default: 0.7

    # Force REASONING tier at lower confidence
    reasoningConfidence: 0.90 # Default: 0.97
```

---

## Testing Configuration

### Dry Run (No API Calls)

For testing routing without making API calls:

```typescript
import { route, DEFAULT_ROUTING_CONFIG, BLOCKRUN_MODELS } from "openclaw-router";

// Build pricing map
const modelPricing = new Map();
for (const m of BLOCKRUN_MODELS) {
  modelPricing.set(m.id, { inputPrice: m.inputPrice, outputPrice: m.outputPrice });
}

// Test routing decisions locally
const decision = route("Prove sqrt(2) is irrational", undefined, 4096, {
  config: DEFAULT_ROUTING_CONFIG,
  modelPricing,
});

console.log(decision);
// { model: "deepseek/deepseek-reasoner", tier: "REASONING", ... }
```

### Run Tests

```bash
# Router tests
npx tsx test/e2e.ts

# Proxy reuse tests
npx tsx test/proxy-reuse.ts

# Full test suite
npm run test:resilience:quick
```
