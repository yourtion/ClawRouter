#!/bin/bash
set -e

echo "🦞 ClawRouter Reinstall"
echo ""

# 1. Remove plugin files
echo "→ Removing plugin files..."
rm -rf ~/.openclaw/extensions/clawrouter

# 2. Clean config entries
echo "→ Cleaning config entries..."
node -e "
const f = require('os').homedir() + '/.openclaw/openclaw.json';
const fs = require('fs');
if (!fs.existsSync(f)) {
  console.log('  No openclaw.json found, skipping');
  process.exit(0);
}

let c;
try {
  c = JSON.parse(fs.readFileSync(f, 'utf8'));
} catch (err) {
  const backupPath = f + '.corrupt.' + Date.now();
  console.error('  ERROR: Invalid JSON in openclaw.json');
  console.error('  ' + err.message);
  try {
    fs.copyFileSync(f, backupPath);
    console.log('  Backed up to: ' + backupPath);
  } catch {}
  console.log('  Skipping config cleanup...');
  process.exit(0);
}

// Clean plugin entries
if (c.plugins?.entries?.clawrouter) delete c.plugins.entries.clawrouter;
if (c.plugins?.installs?.clawrouter) delete c.plugins.installs.clawrouter;
// Clean plugins.allow (removes stale clawrouter reference)
if (Array.isArray(c.plugins?.allow)) {
  c.plugins.allow = c.plugins.allow.filter(p => p !== 'clawrouter' && p !== 'openclaw-router');
}
fs.writeFileSync(f, JSON.stringify(c, null, 2));
console.log('  Config cleaned');
"

# 3. Kill old proxy
echo "→ Stopping old proxy..."
lsof -ti :8402 | xargs kill -9 2>/dev/null || true

# 3.1. Remove stale models.json so it gets regenerated with apiKey
echo "→ Cleaning models cache..."
rm -f ~/.openclaw/agents/main/agent/models.json 2>/dev/null || true

# 4. Skip auth profile injection (API key auth only)
echo "→ Skipping auth profile injection (API key auth only)..."

# 5. Skip apiKey setup (API key auth only)
echo "→ Skipping apiKey setup (API key auth only)..."

# 6. Install plugin (config is ready, but no allow list yet to avoid validation error)
echo "→ Installing ClawRouter..."
npm install -g openclaw-router

# 7. Add plugin to allow list (done AFTER install so plugin files exist for validation)
echo "→ Adding to plugins allow list..."
node -e "
const os = require('os');
const fs = require('fs');
const path = require('path');
const configPath = path.join(os.homedir(), '.openclaw', 'openclaw.json');

if (fs.existsSync(configPath)) {
  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

    // Ensure plugins.allow exists and includes clawrouter
    if (!config.plugins) config.plugins = {};
    if (!Array.isArray(config.plugins.allow)) {
      config.plugins.allow = [];
    }
    if (!config.plugins.allow.includes('clawrouter') && !config.plugins.allow.includes('openclaw-router')) {
      config.plugins.allow.push('clawrouter');
      console.log('  Added clawrouter to plugins.allow');
    } else {
      console.log('  Plugin already in allow list');
    }

    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  } catch (e) {
    console.log('  Could not update config:', e.message);
  }
} else {
  console.log('  No openclaw.json found, skipping');
}
"

echo ""
echo "✓ Done! Smart routing enabled by default."
echo ""
echo "Run: openclaw gateway restart"
echo ""
echo "Model aliases available:"
echo "  /model sonnet    → anthropic/claude-sonnet-4"
echo "  /model deepseek  → deepseek/deepseek-chat"
echo "  /model free      → gpt-oss-120b (FREE)"
echo ""
echo "To uninstall: bash ~/.openclaw/extensions/clawrouter/scripts/uninstall.sh"
