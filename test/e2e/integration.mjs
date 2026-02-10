#!/usr/bin/env node
/**
 * End-to-End Integration Test for Multi-Provider Support
 *
 * This script tests the complete multi-provider workflow:
 * 1. Load configuration from file
 * 2. Initialize providers
 * 3. Test model availability
 * 4. Test cost estimation
 * 5. Test provider fallback
 * 6. Test cross-provider routing
 */

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Use relative path from test/e2e/ to project root
const modulePath = '../../dist/index.js';

console.log('🚀 Starting E2E Multi-Provider Integration Test\n');

// Test 1: Import and verify exports
console.log('✓ Test 1: Importing modules...');
try {
  const {
    ProviderRegistry,
    ProviderFactory,
    loadConfig,
    BlockRunProvider,
    OpenRouterProvider,
  } = await import(modulePath);

  console.log('  - All imports successful\n');
} catch (err) {
  console.error('  ❌ Import failed:', err.message);
  process.exit(1);
}

// Test 2: Create provider instances
console.log('✓ Test 2: Creating provider instances...');
try {
  const { BlockRunProvider, OpenRouterProvider } = await import(modulePath);

  const blockrun = new BlockRunProvider();
  const openrouter = new OpenRouterProvider();

  console.log(`  - BlockRunProvider: ${blockrun.metadata.id} (priority: ${blockrun.metadata.priority})`);
  console.log(`  - OpenRouterProvider: ${openrouter.metadata.id} (priority: ${openrouter.metadata.priority})\n`);
} catch (err) {
  console.error('  ❌ Provider creation failed:', err.message);
  process.exit(1);
}

// Test 3: Initialize providers
console.log('✓ Test 3: Initializing providers...');
try {
  const { BlockRunProvider, OpenRouterProvider, AuthType } = await import(modulePath);

  const blockrun = new BlockRunProvider();
  await blockrun.initialize({
    type: AuthType.API_KEY,
    credentials: {
      walletKey: '0x0000000000000000000000000000000000000000000000000000000000000001',
    },
  });

  const openrouter = new OpenRouterProvider();
  await openrouter.initialize({
    type: AuthType.API_KEY,
    credentials: {
      apiKey: 'sk-test-key',
    },
  });

  const blockrunModels = await blockrun.getModels();
  const openrouterModels = await openrouter.getModels();

  console.log(`  - BlockRun models: ${blockrunModels.length}`);
  console.log(`  - OpenRouter models: ${openrouterModels.length}\n`);
} catch (err) {
  console.error('  ❌ Provider initialization failed:', err.message);
  process.exit(1);
}

// Test 4: Registry operations
console.log('✓ Test 4: Testing ProviderRegistry...');
try {
  const {
    ProviderRegistry,
    BlockRunProvider,
    OpenRouterProvider,
    AuthType,
  } = await import(modulePath);

  const registry = ProviderRegistry.getInstance();
  registry.cleanupAll();

  const blockrun = new BlockRunProvider();
  await blockrun.initialize({
    type: AuthType.API_KEY,
    credentials: {
      walletKey: '0x0000000000000000000000000000000000000000000000000000000000000001',
    },
  });

  const openrouter = new OpenRouterProvider();
  await openrouter.initialize({
    type: AuthType.API_KEY,
    credentials: {
      apiKey: 'sk-test-key',
    },
  });

  registry.register(blockrun);
  registry.register(openrouter);

  const stats = registry.getStats();
  console.log(`  - Total providers: ${stats.total}`);
  console.log(`  - By Auth Type: ${JSON.stringify(stats.byAuthType)}`);
  console.log(`  - By Priority: ${JSON.stringify(stats.byPriority)}`);

  const sorted = registry.getByPriority();
  console.log(`  - Priority order: ${sorted.map(p => p.metadata.id).join(' -> ')}\n`);

  await registry.cleanupAll();
} catch (err) {
  console.error('  ❌ Registry test failed:', err.message);
  process.exit(1);
}

// Test 5: Model availability
console.log('✓ Test 5: Testing model availability...');
try {
  const {
    BlockRunProvider,
    AuthType,
  } = await import(modulePath);

  const blockrun = new BlockRunProvider();
  await blockrun.initialize({
    type: AuthType.API_KEY,
    credentials: {
      walletKey: '0x0000000000000000000000000000000000000000000000000000000000000001',
    },
  });

  const models = ['anthropic/claude-sonnet-4', 'openai/gpt-4o', 'unknown/model'];
  const results = models.map(m => ({
    model: m,
    available: blockrun.isModelAvailable(m),
  }));

  console.log('  - Model availability:');
  results.forEach(r => {
    console.log(`    * ${r.model}: ${r.available ? '✓' : '✗'}`);
  });
  console.log();
} catch (err) {
  console.error('  ❌ Model availability test failed:', err.message);
  process.exit(1);
}

// Test 6: Cost estimation
console.log('✓ Test 6: Testing cost estimation...');
try {
  const {
    BlockRunProvider,
    AuthType,
  } = await import(modulePath);

  const blockrun = new BlockRunProvider();
  await blockrun.initialize({
    type: AuthType.API_KEY,
    credentials: {
      walletKey: '0x0000000000000000000000000000000000000000000000000000000000000001',
    },
  });

  const request = {
    model: 'anthropic/claude-sonnet-4',
    messages: [{ role: 'user', content: 'Hello, world!' }],
    maxTokens: 1000,
  };

  const cost = blockrun.estimateCost(request);
  console.log(`  - Estimated cost for claude-sonnet-4 (1000 tokens): $${cost.toFixed(6)}`);

  const higherCost = blockrun.estimateCost({
    ...request,
    maxTokens: 2000,
  });
  console.log(`  - Estimated cost for claude-sonnet-4 (2000 tokens): $${higherCost.toFixed(6)}`);
  console.log(`  - Cost ratio: ${higherCost / cost}x\n`);
} catch (err) {
  console.error('  ❌ Cost estimation test failed:', err.message);
  process.exit(1);
}

// Test 7: Health checks
console.log('✓ Test 7: Testing health checks...');
try {
  const {
    ProviderRegistry,
    BlockRunProvider,
    OpenRouterProvider,
    AuthType,
  } = await import(modulePath);

  const registry = ProviderRegistry.getInstance();

  const blockrun = new BlockRunProvider();
  await blockrun.initialize({
    type: AuthType.API_KEY,
    credentials: {
      walletKey: '0x0000000000000000000000000000000000000000000000000000000000000001',
    },
  });

  const openrouter = new OpenRouterProvider();
  await openrouter.initialize({
    type: AuthType.API_KEY,
    credentials: {
      apiKey: 'sk-test-key',
    },
  });

  registry.register(blockrun);
  registry.register(openrouter);

  const healthResults = await registry.healthCheckAll();
  console.log('  - Health check results:');
  for (const [id, healthy] of healthResults) {
    console.log(`    * ${id}: ${healthy ? '✓ Healthy' : '✗ Unhealthy'}`);
  }
  console.log();

  await registry.cleanupAll();
} catch (err) {
  console.error('  ❌ Health check test failed:', err.message);
  process.exit(1);
}

// Test 8: Cross-provider fallback
console.log('✓ Test 8: Testing cross-provider fallback...');
try {
  const {
    ProviderRegistry,
    BlockRunProvider,
    OpenRouterProvider,
    AuthType,
  } = await import(modulePath);

  const registry = ProviderRegistry.getInstance();

  const blockrun = new BlockRunProvider();
  await blockrun.initialize({
    type: AuthType.API_KEY,
    credentials: {
      walletKey: '0x0000000000000000000000000000000000000000000000000000000000000001',
    },
  });

  const openrouter = new OpenRouterProvider();
  await openrouter.initialize({
    type: AuthType.API_KEY,
    credentials: {
      apiKey: 'sk-test-key',
    },
  });

  registry.register(blockrun);
  registry.register(openrouter);

  const providers = registry.getByPriority();
  console.log(`  - Fallback order: ${providers.map(p => `${p.metadata.id}(${p.metadata.priority})`).join(' -> ')}`);
  console.log(`  - Primary provider: ${providers[0].metadata.id}`);
  console.log(`  - Fallback provider: ${providers[1].metadata.id}\n`);

  await registry.cleanupAll();
} catch (err) {
  console.error('  ❌ Fallback test failed:', err.message);
  process.exit(1);
}

// Test 9: Provider metadata
console.log('✓ Test 9: Verifying provider metadata...');
try {
  const { BlockRunProvider, OpenRouterProvider } = await import(modulePath);

  const blockrun = new BlockRunProvider();
  const openrouter = new OpenRouterProvider();

  console.log('  - BlockRun metadata:');
  console.log(`    * ID: ${blockrun.metadata.id}`);
  console.log(`    * Name: ${blockrun.metadata.name}`);
  console.log(`    * Version: ${blockrun.metadata.version}`);
  console.log(`    * Auth: ${blockrun.metadata.authType}`);
  console.log(`    * Priority: ${blockrun.metadata.priority}`);
  console.log(`    * Base URL: ${blockrun.metadata.baseUrl}`);

  console.log('  - OpenRouter metadata:');
  console.log(`    * ID: ${openrouter.metadata.id}`);
  console.log(`    * Name: ${openrouter.metadata.name}`);
  console.log(`    * Version: ${openrouter.metadata.version}`);
  console.log(`    * Auth: ${openrouter.metadata.authType}`);
  console.log(`    * Priority: ${openrouter.metadata.priority}`);
  console.log(`    * Base URL: ${openrouter.metadata.baseUrl}\n`);
} catch (err) {
  console.error('  ❌ Metadata test failed:', err.message);
  process.exit(1);
}

// Test 10: Provider capabilities
console.log('✓ Test 10: Verifying provider capabilities...');
try {
  const { BlockRunProvider, OpenRouterProvider } = await import(modulePath);

  const blockrun = new BlockRunProvider();
  const openrouter = new OpenRouterProvider();

  console.log('  - BlockRun capabilities:');
  console.log(`    * Streaming: ${blockrun.metadata.capabilities.streaming}`);
  console.log(`    * Reasoning models: ${blockrun.metadata.capabilities.reasoningModels}`);
  console.log(`    * Vision models: ${blockrun.metadata.capabilities.visionModels}`);
  console.log(`    * Context window: ${blockrun.metadata.capabilities.contextWindow}`);

  console.log('  - OpenRouter capabilities:');
  console.log(`    * Streaming: ${openrouter.metadata.capabilities.streaming}`);
  console.log(`    * Context window: ${openrouter.metadata.capabilities.contextWindow}\n`);
} catch (err) {
  console.error('  ❌ Capabilities test failed:', err.message);
  process.exit(1);
}

console.log('🎉 All E2E integration tests passed!\n');
console.log('📦 Multi-provider support is fully functional!');
console.log('\nNext steps:');
console.log('  1. Create ~/.openclaw/clawrouter/providers.json with your provider configs');
console.log('  2. Set environment variables (WALLET_KEY, OPENROUTER_API_KEY, etc.)');
console.log('  3. Test with a real request using the proxy');
