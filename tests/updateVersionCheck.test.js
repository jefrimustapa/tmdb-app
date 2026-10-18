import assert from 'assert';
import {
  extractVersionFromApkName,
  extractRunNumber,
  extractDateNumber,
  compareSemVer,
  compareVersions,
  isInstalledUpToDate,
  isReleaseMatchingInstalled
} from '../src/services/updateService.ts';

let passed = 0;
let total = 0;

async function it(desc, fn) {
  total++;
  try {
    await fn();
    console.log(`  ✓ ${desc}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${desc}`);
    console.error(`    ${err.message}`);
    process.exitCode = 1;
  }
}

console.log('\n--- Update Version Check Test Suite (Issue #200) ---\n');

async function run() {
  await it('extractVersionFromApkName extracts semantic version from nightly and release APK filenames', () => {
    assert.strictEqual(
      extractVersionFromApkName('tmdb-stream-v1.2.0-nightly.20261017.81-debug.apk'),
      '1.2.0-nightly.20261017.81'
    );
    assert.strictEqual(
      extractVersionFromApkName('tmdb-stream-v1.2.0-nightly.20261018.82-release.apk'),
      '1.2.0-nightly.20261018.82'
    );
    assert.strictEqual(
      extractVersionFromApkName('tmdb-stream-v1.2.0-debug.apk'),
      '1.2.0'
    );
    assert.strictEqual(
      extractVersionFromApkName('tmdb-stream-v1.2.0-rc.1-debug.apk'),
      '1.2.0-rc.1'
    );
    assert.strictEqual(extractVersionFromApkName(''), null);
  });

  await it('extractRunNumber extracts CI run number correctly', () => {
    assert.strictEqual(extractRunNumber('tmdb-stream-v1.2.0-nightly.20261017.81-debug.apk'), 81);
    assert.strictEqual(extractRunNumber('1.2.0-nightly.20261017.81'), 81);
    assert.strictEqual(extractRunNumber('tmdb-stream-v1.2.0-nightly.20261015.78-debug.apk'), 78);
    assert.strictEqual(extractRunNumber('tmdb-stream-v1.2.0-nightly.20261015.79-debug.apk'), 79);
    assert.strictEqual(extractRunNumber('tmdb-stream-v1.2.0-nightly.20261015.100-debug.apk'), 100);
    assert.strictEqual(extractRunNumber('nightly-20261017'), 0);
    assert.strictEqual(extractRunNumber('1.2.0'), 0);
  });

  await it('extractDateNumber extracts 8-digit date from tag or version string', () => {
    assert.strictEqual(extractDateNumber('nightly-20261017'), 20261017);
    assert.strictEqual(extractDateNumber('1.2.0-nightly.20261017.81'), 20261017);
    assert.strictEqual(extractDateNumber('20261017083012'), 20261017);
    assert.strictEqual(extractDateNumber('1.2.0'), 0);
  });

  await it('compareSemVer correctly handles major, minor, patch and prerelease ordering', () => {
    assert.ok(compareSemVer('1.2.1', '1.2.0') > 0);
    assert.ok(compareSemVer('1.3.0', '1.2.9') > 0);
    assert.strictEqual(compareSemVer('1.2.0', '1.2.0'), 0);
    assert.ok(compareSemVer('1.2.0', '1.2.1') < 0);

    // Official release is higher than prerelease on same base version
    assert.ok(compareSemVer('1.2.0', '1.2.0-rc.1') > 0);
    assert.ok(compareSemVer('1.2.0', '1.2.0-nightly.20261017.81') > 0);

    // Prerelease comparison
    assert.ok(compareSemVer('1.2.0-rc.2', '1.2.0-rc.1') > 0);
    assert.ok(compareSemVer('1.2.0-rc.10', '1.2.0-rc.2') > 0);
    assert.strictEqual(compareSemVer('1.2.0-rc.1', '1.2.0-rc.1'), 0);
  });

  await it('Issue #200: Installed nightly matches latest release on same date and run -> no update prompt', () => {
    // Scenario: User just updated to nightly 20261017 run 81 and opens the app
    const isUpToDate = isInstalledUpToDate({
      candidateVersion: '1.2.0-nightly.20261017.81',
      candidateIsNightly: true,
      currentFullVersion: '1.2.0-nightly.20261017.81',
      currentBuildNumber: '20261017120000',
      currentChannel: 'nightly'
    });
    assert.strictEqual(isUpToDate, true, 'App should report UP TO DATE when running the latest release');
  });

  await it('Same date: New CI run uploaded later in the day is detected as an update', () => {
    // Scenario: User is on run 78 (from earlier in the day), release now has run 79
    const isUpToDate = isInstalledUpToDate({
      candidateVersion: '1.2.0-nightly.20261015.79',
      candidateIsNightly: true,
      currentFullVersion: '1.2.0-nightly.20261015.78',
      currentBuildNumber: '20261015080000',
      currentChannel: 'nightly'
    });
    assert.strictEqual(isUpToDate, false, 'App should detect that Run 79 is newer than Run 78');
  });

  await it('Same date: Candidate with lower run number is not considered an update', () => {
    const isUpToDate = isInstalledUpToDate({
      candidateVersion: '1.2.0-nightly.20261015.78',
      candidateIsNightly: true,
      currentFullVersion: '1.2.0-nightly.20261015.79',
      currentBuildNumber: '20261015180000',
      currentChannel: 'nightly'
    });
    assert.strictEqual(isUpToDate, true, 'App should not offer downgrade to lower run number');
  });

  await it('Next date nightly is detected as an update', () => {
    const isUpToDate = isInstalledUpToDate({
      candidateVersion: '1.2.0-nightly.20261018.82',
      candidateIsNightly: true,
      currentFullVersion: '1.2.0-nightly.20261017.81',
      currentBuildNumber: '20261017120000',
      currentChannel: 'nightly'
    });
    assert.strictEqual(isUpToDate, false, 'Next day nightly is an update');
  });

  await it('Previous date nightly does not downgrade current build', () => {
    const isUpToDate = isInstalledUpToDate({
      candidateVersion: '1.2.0-nightly.20261016.80',
      candidateIsNightly: true,
      currentFullVersion: '1.2.0-nightly.20261017.81',
      currentBuildNumber: '20261017120000',
      currentChannel: 'nightly'
    });
    assert.strictEqual(isUpToDate, true, 'Previous day nightly is not an update');
  });

  await it('Dev build detects newer official nightly release on the same date', () => {
    const isUpToDate = isInstalledUpToDate({
      candidateVersion: '1.2.0-nightly.20261018.82',
      candidateIsNightly: true,
      currentFullVersion: '1.2.0-dev.jefri.20261018-0749',
      currentBuildNumber: '20261018-0749',
      currentChannel: 'dev'
    });
    assert.strictEqual(isUpToDate, false, 'Dev build should detect official CI nightly release on same date');
  });

  await it('Stable official release correctly updates a nightly build of the same base version', () => {
    const isUpToDate = isInstalledUpToDate({
      candidateVersion: '1.2.0',
      candidateIsNightly: false,
      currentFullVersion: '1.2.0-nightly.20261017.81',
      currentBuildNumber: '20261017120000',
      currentChannel: 'nightly'
    });
    assert.strictEqual(isUpToDate, false, 'Official stable 1.2.0 supersedes nightly 1.2.0-nightly');
  });

  await it('isReleaseMatchingInstalled correctly matches nightly release with dot/hyphen', () => {
    const mockRel = {
      tag_name: 'nightly-20261017',
      prerelease: true,
      assets: [{ name: 'tmdb-stream-v1.2.0-nightly.20261017.81-debug.apk' }]
    };

    assert.strictEqual(
      isReleaseMatchingInstalled(mockRel, '1.2.0-nightly.20261017.81', 'nightly'),
      true
    );
    assert.strictEqual(
      isReleaseMatchingInstalled(mockRel, '1.2.0-nightly.20261018.82', 'nightly'),
      false
    );
  });

  await it('APK asset sorting prioritizes higher numeric run numbers (including across digit boundaries like 99 vs 100)', () => {
    const assets = [
      { name: 'tmdb-stream-v1.2.0-nightly.20261015.78-debug.apk' },
      { name: 'tmdb-stream-v1.2.0-nightly.20261015.79-debug.apk' },
    ];

    assets.sort((a, b) => {
      const runA = extractRunNumber(a.name);
      const runB = extractRunNumber(b.name);
      if (runA !== runB) {
        return runB - runA;
      }
      return b.name.localeCompare(a.name);
    });

    assert.strictEqual(assets[0].name, 'tmdb-stream-v1.2.0-nightly.20261015.79-debug.apk');

    // Test across digit boundary: 99 vs 100 (where standard string localeCompare would fail)
    const boundaryAssets = [
      { name: 'tmdb-stream-v1.2.0-nightly.20261015.99-debug.apk' },
      { name: 'tmdb-stream-v1.2.0-nightly.20261015.100-debug.apk' },
    ];

    boundaryAssets.sort((a, b) => {
      const runA = extractRunNumber(a.name);
      const runB = extractRunNumber(b.name);
      if (runA !== runB) {
        return runB - runA;
      }
      return b.name.localeCompare(a.name);
    });

    assert.strictEqual(boundaryAssets[0].name, 'tmdb-stream-v1.2.0-nightly.20261015.100-debug.apk');
  });

  await it('updateService.checkForUpdates returns structured UpdateInfo with full version and apk details', async () => {
    const { updateService } = await import('../src/services/updateService.ts');
    const info = await updateService.checkForUpdates(true);

    assert.strictEqual(typeof info.hasUpdate, 'boolean');
    assert.strictEqual(typeof info.currentVersion, 'string');
    assert.strictEqual(typeof info.latestVersion, 'string');
    assert.ok(info.latestVersion.length > 0);
    assert.strictEqual(info.isNightly, true);
    if (info.apkUrl) {
      assert.ok(info.apkName.endsWith('.apk'));
      assert.ok(info.latestVersion.includes('1.2.0-nightly'));
    }
  });

  console.log(`\nTests completed: ${passed}/${total} passed.\n`);
}

run();
