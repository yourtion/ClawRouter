#!/usr/bin/env node
/**
 * Simple verification script for multi-provider support
 */

import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Use relative path from test/integration/ to project root
const modulePath = '../../dist/index.js';

console.log('🧪 Testing Multi-Provider Support...\n');

// Test 1: Import compiled module
console.log('✓ Test 1: Importing compiled module...');
try {
  const module = await import(modulePath);
  console.log('  - ProviderRegistry:', typeof module.ProviderRegistry);
  console.log('  - ProviderFactory:', typeof module.ProviderFactory);
  console.log('  - BlockRunProvider:', typeof module.BlockRunProvider);
  console.log('  - OpenRouterProvider:', typeof module.OpenRouterProvider);
  console.log('  - loadConfig:', typeof module.loadConfig);
  console.log('  ✅ PASS\n');
} catch (err) {
  console.error('  ❌ FAIL:', err.message);
  process.exit(1);
}

// Test 2: Create provider instances
console.log('✓ Test 2: Creating provider instances...');
try {
  const { BlockRunProvider, OpenRouterProvider } = await import(modulePath);

  const blockrun = new BlockRunProvider();
  console.log('  - BlockRunProvider ID:', blockrun.metadata.id);
  console.log('  - BlockRunProvider Priority:', blockrun.metadata.priority);
  console.log('  - BlockRunProvider Auth:', blockrun.metadata.authType);

  const openrouter = new OpenRouterProvider();
  console.log('  - OpenRouterProvider ID:', openrouter.metadata.id);
  console.log('  - OpenRouterProvider Priority:', openrouter.metadata.priority);
  console.log('  - OpenRouterProvider Auth:', openrouter.metadata.authType);
  console.log('  ✅ PASS\n');
} catch (err) {
  console.error('  ❌ FAIL:', err.message);
  process.exit(1);
}

// Test 3: Provider Registry
console.log('✓ Test 3: Testing ProviderRegistry...');
try {
  const { ProviderRegistry, BlockRunProvider, OpenRouterProvider } = await import(modulePath);

  const registry = ProviderRegistry.getInstance();
  registry.cleanupAll();

  const blockrun = new BlockRunProvider();
  const openrouter = new OpenRouterProvider();

  registry.register(blockrun);
  registry.register(openrouter);

  const stats = registry.getStats();
  console.log('  - Total providers:', stats.total);
  console.log('  - By Auth Type:', JSON.stringify(stats.byAuthType));
  console.log('  - By Priority:', JSON.stringify(stats.byPriority));

  const sorted = registry.getByPriority();
  console.log('  - Priority order:', sorted.map(p => `${p.metadata.id}(${p.metadata.priority})`).join(' -> '));
  console.log('  ✅ PASS\n');
} catch (err) {
  console.error('  ❌ FAIL:', err.message);
  console.error(err);
  process.exit(1);
}

// Test 4: Legacy exports
console.log('✓ Test 4: Verifying legacy exports...');
try {
  const module = await import(modulePath);

  const legacyExports = [
    'startProxy',
    'blockrunProvider',
    'OPENCLAW_MODELS',
    'BLOCKRUN_MODELS',
    'route',
    'DEFAULT_ROUTING_CONFIG',
  ];

  for (const exp of legacyExports) {
    if (module[exp] === undefined) {
      throw new Error(`Legacy export '${exp}' not found`);
    }
  }

  console.log('  - All legacy exports present:', legacyExports.join(', '));
  console.log('  ✅ PASS\n');
} catch (err) {
  console.error('  ❌ FAIL:', err.message);
  process.exit(1);
}

// Note: Type exports are embedded in .d.ts file but not runtime accessible
// This is normal for TypeScript - types are for compile-time checking
console.log('✓ Test 5: Verifying type definitions...');
try {
  const fs = await import('node:fs/promises');
  const dtsContent = await fs.readFile('dist/index.d.ts', 'utf-8');

  const typeDefinitions = [
    'IProvider',
    'ProviderConfig',
    'ProviderMetadata',
    'StandardModel',
    'RequestContext',
    'ProviderResponse',
    'ProviderBalanceInfo',
    'AuthConfig',
    'AuthType',
  ];

  for (const type of typeDefinitions) {
    if (!dtsContent.includes(type)) {
      throw new Error(`Type definition '${type}' not found in .d.ts file`);
    }
  }

  console.log('  - All type definitions present in dist/index.d.ts');
  console.log('  ✅ PASS\n');
} catch (err) {
  console.error('  ❌ FAIL:', err.message);
  process.exit(1);
}

console.log('🎉 All tests passed!');
console.log('\n📦 Multi-provider support is ready to use!');
console.log('\nTo enable multi-provider mode, set:');
console.log('  export OPENCLAW_ROUTER_MULTI_PROVIDER=true');
console.log('\nThen create a config file at ~/.openclaw/clawrouter/providers.json');
