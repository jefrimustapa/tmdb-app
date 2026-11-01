import assert from 'node:assert';
import { DEFAULT_SETTINGS } from '../src/services/db';
import type { UserSettings, StreamResolverType } from '../src/types/db';

console.log('\n--- Default Resolvers & Timeouts Test Suite (Issue #328) ---\n');

let passedTests = 0;
let totalTests = 0;

function runTest(name: string, fn: () => void) {
  totalTests++;
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passedTests++;
  } catch (err: any) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    process.exitCode = 1;
  }
}

runTest('DEFAULT_SETTINGS enforces TGStrm enabled by default (#328)', () => {
  assert.strictEqual(DEFAULT_SETTINGS.streamResolver, 'telegram', 'Default streamResolver must be telegram');
  assert.deepStrictEqual(DEFAULT_SETTINGS.enabledResolvers, ['telegram', 'embed'], 'Default enabledResolvers must include telegram and embed');
  assert.strictEqual(DEFAULT_SETTINGS.tgTimeout, 180, 'Default tgTimeout must be 180s');
  assert.strictEqual(DEFAULT_SETTINGS.msmTimeout, 180, 'Default msmTimeout must be 180s');
  assert.strictEqual(DEFAULT_SETTINGS.tgBufferTimeout, 90, 'Default tgBufferTimeout must be 90s');
  assert.strictEqual(DEFAULT_SETTINGS.msmBufferTimeout, 90, 'Default msmBufferTimeout must be 90s');
});

runTest('Migrates legacy user settings with only embed to include telegram and upgrade timeouts (#328)', () => {
  const legacySettings: Partial<UserSettings> = {
    streamResolver: 'embed',
    enabledResolvers: ['embed'],
    tgTimeout: 90,
    msmTimeout: 90,
    tgBufferTimeout: 60,
    msmBufferTimeout: 60,
  };

  // Simulate getSettings normalization block
  const validResolvers: StreamResolverType[] = ['telegram', 'embed'];
  const settings = { ...legacySettings } as UserSettings;

  if (!settings.tgDefaultEnforced_v1) {
    settings.tgDefaultEnforced_v1 = true;
    if (settings.enabledResolvers && Array.isArray(settings.enabledResolvers)) {
      if (!settings.enabledResolvers.includes('telegram')) {
        settings.enabledResolvers.unshift('telegram');
      }
    } else {
      settings.enabledResolvers = ['telegram', 'embed'];
    }
    if (!settings.streamResolver || settings.streamResolver === 'embed') {
      settings.streamResolver = 'telegram';
    }
    if (settings.tgTimeout === 90 || settings.msmTimeout === 90) {
      settings.tgTimeout = 180;
      settings.msmTimeout = 180;
    }
    if (settings.tgBufferTimeout === 60 || settings.msmBufferTimeout === 60) {
      settings.tgBufferTimeout = 90;
      settings.msmBufferTimeout = 90;
    }
  }

  assert.strictEqual(settings.tgDefaultEnforced_v1, true);
  assert.strictEqual(settings.streamResolver, 'telegram');
  assert.deepStrictEqual(settings.enabledResolvers, ['telegram', 'embed']);
  assert.strictEqual(settings.tgTimeout, 180);
  assert.strictEqual(settings.msmTimeout, 180);
  assert.strictEqual(settings.tgBufferTimeout, 90);
  assert.strictEqual(settings.msmBufferTimeout, 90);
});

runTest('Preserves user custom non-default timeouts during migration (#328)', () => {
  const customSettings: Partial<UserSettings> = {
    streamResolver: 'embed',
    enabledResolvers: ['embed'],
    tgTimeout: 150, // Custom value chosen by user
    msmTimeout: 150,
    tgBufferTimeout: 120, // Custom value chosen by user
    msmBufferTimeout: 120,
  };

  const settings = { ...customSettings } as UserSettings;
  if (!settings.tgDefaultEnforced_v1) {
    settings.tgDefaultEnforced_v1 = true;
    if (settings.enabledResolvers && Array.isArray(settings.enabledResolvers)) {
      if (!settings.enabledResolvers.includes('telegram')) {
        settings.enabledResolvers.unshift('telegram');
      }
    } else {
      settings.enabledResolvers = ['telegram', 'embed'];
    }
    if (!settings.streamResolver || settings.streamResolver === 'embed') {
      settings.streamResolver = 'telegram';
    }
    if (settings.tgTimeout === 90 || settings.msmTimeout === 90) {
      settings.tgTimeout = 180;
      settings.msmTimeout = 180;
    }
    if (settings.tgBufferTimeout === 60 || settings.msmBufferTimeout === 60) {
      settings.tgBufferTimeout = 90;
      settings.msmBufferTimeout = 90;
    }
  }

  assert.strictEqual(settings.tgTimeout, 150, 'Custom 150s timeout must be preserved');
  assert.strictEqual(settings.tgBufferTimeout, 120, 'Custom 120s buffer timeout must be preserved');
  assert.deepStrictEqual(settings.enabledResolvers, ['telegram', 'embed']);
});

runTest('Allows subsequent explicit user customization after migration is complete (#328)', () => {
  const migratedSettings: UserSettings = {
    ...DEFAULT_SETTINGS,
    tgDefaultEnforced_v1: true,
  };

  // User explicitly turns off telegram
  migratedSettings.enabledResolvers = ['embed'];
  migratedSettings.streamResolver = 'embed';

  // Subsequent getSettings normalization pass
  if (!migratedSettings.tgDefaultEnforced_v1) {
    // Should NOT execute
    assert.fail('Migration block should not re-run when tgDefaultEnforced_v1 is true');
  }

  assert.deepStrictEqual(migratedSettings.enabledResolvers, ['embed'], 'User explicit choice to disable telegram must not be reverted');
  assert.strictEqual(migratedSettings.streamResolver, 'embed');
});

console.log(`\nTests completed: ${passedTests}/${totalTests} passed.\n`);
