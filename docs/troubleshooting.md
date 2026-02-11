# Troubleshooting

Quick solutions for common OpenClaw Router issues.

> Need help? [Open a Discussion](https://github.com/yourtion/ClawRouter/discussions) or check [existing issues](https://github.com/yourtion/ClawRouter/issues).

## Table of Contents

- [Quick Checklist](#quick-checklist)
- [Common Errors](#common-errors)
- [Security Scanner Warnings](#security-scanner-warnings)
- [Port Conflicts](#port-conflicts)
- [How to Update](#how-to-update)
- [Verify Routing](#verify-routing)

---

## Quick Checklist

```bash
# 1. Check your version (should be 0.5.7+)
cat ~/.openclaw/extensions/clawrouter/package.json | grep version

# 2. Check proxy is running
curl http://localhost:8402/health

# 3. Watch routing in action
openclaw logs --follow
# Should see: gemini-2.5-flash $0.0012 (saved 99%)

# 4. View cost savings
/stats
```

---

## Common Errors

### "Unknown model: auto"

Plugin isn't loaded or outdated.

**Fix:** Update to the latest version: `npm update -g openclaw-router`

### "No API key found for provider"

API key is missing or not configured properly.

**Fix:** Check your provider configuration in `~/.openclaw/clawrouter/providers.json` and ensure API keys are set.

### "Config validation failed: plugin not found: clawrouter"

Plugin directory was removed but config still references it. This blocks all OpenClaw commands until fixed.

**Fix:** See [How to Update](#how-to-update) for complete cleanup steps.

---

## Port Conflicts

### Port 8402 already in use

As of v0.4.1, OpenClaw Router automatically detects and reuses an existing proxy on the configured port instead of failing with `EADDRINUSE`. You should no longer see this error.

If you need to use a different port:

```bash
# Set custom port via environment variable
export CLAWROUTER_PROXY_PORT=8403
openclaw gateway restart
```

To manually check/kill the process:

```bash
lsof -i :8402
# Kill the process or restart OpenClaw
```

---

## How to Update

```bash
npm update -g openclaw-router
openclaw gateway restart
```

This updates to the latest version and restarts the gateway.

---

## Verify Routing

```bash
openclaw logs --follow
```

You should see model selection for each request:

```
[plugins] [SIMPLE] google/gemini-2.5-flash $0.0012 (saved 99%)
[plugins] [MEDIUM] deepseek/deepseek-chat $0.0003 (saved 99%)
[plugins] [REASONING] deepseek/deepseek-reasoner $0.0005 (saved 99%)
```
