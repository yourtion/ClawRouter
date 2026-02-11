# Architecture

Technical deep-dive into OpenClaw Router's internals.

## Table of Contents

- [System Overview](#system-overview)
- [Request Flow](#request-flow)
- [Routing Engine](#routing-engine)
- [Optimizations](#optimizations)
- [Source Structure](#source-structure)

---

## System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     OpenClaw / Your App                     │
│                   (OpenAI-compatible client)                │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                 OpenClaw Router Proxy (localhost)           │
│  ┌─────────────┐  ┌─────────────┐  ┌───────────────────┐   │
│  │   Dedup     │→ │   Router    │→ │   API Key Auth    │   │
│  │   Cache     │  │  (15-dim)   │  │                   │   │
│  └─────────────┘  └─────────────┘  └───────────────────┘   │
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌───────────────────┐   │
│  │  Fallback   │  │   Provider  │  │   SSE Heartbeat   │   │
│  │   Chain     │  │   Registry  │  │   (streaming)     │   │
│  └─────────────┘  └─────────────┘  └───────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      Provider APIs                           │
│    → OpenRouter | NVIDIA | OpenAI | Anthropic | Google    │
└─────────────────────────────────────────────────────────────┘
```

**Key Principles:**

- **100% local routing** — No API calls for model selection
- **Client-side only** — Your API keys never leave your machine
- **Multi-provider** — Support for multiple authentication methods

---

## Request Flow

### 1. Request Received

```
POST /v1/chat/completions
{
  "model": "auto",
  "messages": [{ "role": "user", "content": "What is 2+2?" }],
  "stream": true
}
```

### 2. Deduplication Check

```typescript
// SHA-256 hash of request body
const dedupKey = RequestDeduplicator.hash(body);

// Check completed cache (30s TTL)
const cached = deduplicator.getCached(dedupKey);
if (cached) {
  return cached; // Replay cached response
}

// Check in-flight requests
const inflight = deduplicator.getInflight(dedupKey);
if (inflight) {
  return await inflight; // Wait for original to complete
}
```

### 3. Smart Routing (if model is `auto`)

```typescript
// Extract user's last message
const prompt = messages.findLast((m) => m.role === "user")?.content;

// Run 15-dimension weighted scorer
const decision = route(prompt, systemPrompt, maxTokens, {
  config: DEFAULT_ROUTING_CONFIG,
  modelPricing,
});

// decision = {
//   model: "google/gemini-2.5-flash",
//   tier: "SIMPLE",
//   confidence: 0.92,
//   savings: 0.99,
//   costEstimate: 0.0012,
// }
```

### 4. SSE Heartbeat (for streaming)

```typescript
if (isStreaming) {
  // Send 200 + headers immediately
  res.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
  });

  // Heartbeat every 2s to prevent timeout
  heartbeatInterval = setInterval(() => {
    res.write(": heartbeat\n\n");
  }, 2000);
}
```

### 5. Provider Selection

```typescript
// Get primary provider based on priority
const provider = await registry.getPrimary();

// Check provider health
const isHealthy = await provider.healthCheck();

// Fallback to next provider if unhealthy
if (!isHealthy) {
  const fallback = await registry.getNext();
  // ...
}
```

### 6. Fallback Chain (on provider errors)

```typescript
const FALLBACK_STATUS_CODES = [400, 401, 429, 500, 502, 503, 504];

for (const model of fallbackChain) {
  const result = await tryModelRequest(model, ...);

  if (result.success) {
    return result.response;
  }

  if (result.isProviderError && !isLastAttempt) {
    console.log(`Fallback: ${model} → next`);
    continue;
  }

  break;
}
```

### 7. Response Streaming

```typescript
// Convert non-streaming JSON to SSE format if needed

// Chunk 1: role
data: {"id":"...","object":"chat.completion.chunk","choices":[{"delta":{"role":"assistant"}}]}

// Chunk 2: content
data: {"id":"...","object":"chat.completion.chunk","choices":[{"delta":{"content":"4"}}]}

// Chunk 3: finish
data: {"id":"...","object":"chat.completion.chunk","choices":[{"delta":{},"finish_reason":"stop"}]}

data: [DONE]
```

---

## Routing Engine

### Weighted Scorer

The routing engine uses a 15-dimension weighted scorer that runs entirely locally:

```typescript
function classifyByRules(
  prompt: string,
  systemPrompt: string | undefined,
  tokenCount: number,
  config: ScoringConfig,
): ClassificationResult {
  let score = 0;
  const signals: string[] = [];

  // Dimension 1: Reasoning markers (weight: 0.18)
  const reasoningCount = countKeywords(prompt, config.reasoningKeywords);
  if (reasoningCount >= 2) {
    score += 0.18 * 2; // Double weight for multiple markers
    signals.push("reasoning");
  }

  // Dimension 2: Code presence (weight: 0.15)
  if (hasCodeBlock(prompt) || countKeywords(prompt, config.codeKeywords) > 0) {
    score += 0.15;
    signals.push("code");
  }

  // ... 13 more dimensions

  // Sigmoid calibration
  const confidence = sigmoid(score, (k = 8), (midpoint = 0.5));

  return { score, confidence, tier: selectTier(score, confidence), signals };
}
```

### Tier Selection

```typescript
function selectTier(score: number, confidence: number): Tier | null {
  // Special case: 2+ reasoning markers → REASONING at high confidence
  if (signals.includes("reasoning") && reasoningCount >= 2) {
    return "REASONING";
  }

  if (confidence < 0.7) {
    return null; // Ambiguous → default to MEDIUM
  }

  if (score < 0.3) return "SIMPLE";
  if (score < 0.6) return "MEDIUM";
  if (score < 0.8) return "COMPLEX";
  return "REASONING";
}
```

### Overrides

Certain conditions force tier assignment:

```typescript
// Large context → COMPLEX
if (tokenCount > 100000) {
  return { tier: "COMPLEX", method: "override:large_context" };
}

// Structured output (JSON/YAML) → min MEDIUM
if (systemPrompt?.includes("json") || systemPrompt?.includes("yaml")) {
  return { tier: Math.max(tier, "MEDIUM"), method: "override:structured" };
}
```

---

## Optimizations

### 1. Request Deduplication

Prevents duplicate requests on retries:

```typescript
class RequestDeduplicator {
  private cache = new Map<string, CachedResponse>();
  private inflight = new Map<string, Promise<CachedResponse>>();
  private TTL_MS = 30_000;

  static hash(body: Buffer): string {
    return createHash("sha256").update(body).digest("hex");
  }

  getCached(key: string): CachedResponse | undefined {
    const entry = this.cache.get(key);
    if (entry && Date.now() - entry.completedAt < this.TTL_MS) {
      return entry;
    }
    return undefined;
  }
}
```

### 2. SSE Heartbeat

Prevents upstream timeout while waiting for provider response:

```
0s:  Request received
0s:  → 200 OK, Content-Type: text/event-stream
0s:  → : heartbeat
2s:  → : heartbeat  (client stays connected)
4s:  → : heartbeat
5s:  Provider response completes
5s:  → data: {"choices":[...]}
5s:  → data: [DONE]
```

### 3. Proxy Reuse

Detects and reuses existing proxy to avoid `EADDRINUSE`:

```typescript
async function startProxy(options: ProxyOptions): Promise<ProxyHandle> {
  const port = options.port ?? getProxyPort();

  // Check if proxy already running
  const existing = await checkExistingProxy(port);
  if (existing) {
    // Return handle that uses existing proxy
    return {
      port,
      baseUrl: `http://127.0.0.1:${port}`,
      close: async () => {},  // No-op
    };
  }

  // Start new proxy
  const server = createServer(...);
  server.listen(port, "127.0.0.1");
  // ...
}
```

---

## Source Structure

```
src/
├── index.ts          # Plugin entry, OpenClaw integration
├── proxy.ts          # HTTP proxy server, request handling
├── provider.ts       # OpenClaw provider registration
├── models.ts         # 30+ model definitions with pricing
├── dedup.ts          # Request deduplication (SHA-256 → cache)
├── logger.ts         # JSON usage logging to disk
├── errors.ts         # Custom error types
├── retry.ts          # Fetch retry with exponential backoff
├── version.ts        # Version from package.json
├── providers/
│   ├── types.ts              # Provider type definitions
│   ├── registry.ts           # Provider registry
│   ├── factory.ts            # Provider factory
│   ├── config.ts             # Configuration loader
│   ├── auth/
│   │   ├── types.ts          # Auth strategy interface
│   │   ├── api-key.ts        # API Key authentication
│   │   └── ...
│   └── implementations/
│       ├── blockrun.ts       # BlockRun provider
│       ├── openrouter.ts     # OpenRouter provider
│       └── ...
└── router/
    ├── index.ts      # route() entry point
    ├── rules.ts      # 15-dimension weighted scorer
    ├── selector.ts   # Tier → model selection + fallback
    ├── config.ts     # Default routing configuration
    └── types.ts      # TypeScript type definitions
```

### Key Files

| File              | Purpose                                               |
| ----------------- | ----------------------------------------------------- |
| `proxy.ts`        | Core request handling, SSE simulation, fallback chain |
| `router/rules.ts` | 15-dimension weighted scorer, multilingual keywords   |
| `dedup.ts`        | SHA-256 hashing, 30s response cache                   |
| `providers/`      | Multi-provider support and authentication             |
