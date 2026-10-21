import assert from 'assert';
import {
  ipToUint32,
  isIpInRanges,
  isMalaysiaIp,
  isPrivateIp,
  extractClientIp,
  isWhitelisted,
  checkGeoAccess,
  createGeoBlockMiddleware,
  MALAYSIA_IPV4_RANGES,
} from './geoblock.js';

let passed = 0;
let total = 0;

function it(desc, fn) {
  total++;
  return (async () => {
    try {
      await fn();
      console.log(`  ✓ ${desc}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ ${desc}`);
      console.error(`    ${err.message}`);
      process.exitCode = 1;
    }
  })();
}

console.log('\n--- MSM-Getter Geo-Blocking Test Suite ---\n');

async function runTests() {
  console.log('1. IP Conversion & Range Verification');
  await it('converts valid IPv4 strings to uint32', () => {
    assert.strictEqual(ipToUint32('0.0.0.0'), 0);
    assert.strictEqual(ipToUint32('255.255.255.255'), 4294967295);
    assert.strictEqual(ipToUint32('127.0.0.1'), 2130706433);
    assert.strictEqual(ipToUint32('invalid'), null);
    assert.strictEqual(ipToUint32('256.0.0.1'), null);
  });

  await it('loads a valid consolidated Malaysian IPv4 ranges array', () => {
    assert.ok(Array.isArray(MALAYSIA_IPV4_RANGES));
    assert.ok(MALAYSIA_IPV4_RANGES.length > 500, `Expected >500 ranges, got ${MALAYSIA_IPV4_RANGES.length}`);
    for (const [start, end] of MALAYSIA_IPV4_RANGES) {
      assert.ok(typeof start === 'number' && typeof end === 'number');
      assert.ok(start <= end, `Range start ${start} must be <= end ${end}`);
    }
  });

  console.log('\n2. Private / LAN IP Detection (isPrivateIp)');
  await it('correctly identifies loopback and RFC1918 private subnets', () => {
    assert.strictEqual(isPrivateIp('127.0.0.1'), true);
    assert.strictEqual(isPrivateIp('localhost'), true);
    assert.strictEqual(isPrivateIp('::1'), true);
    assert.strictEqual(isPrivateIp('::ffff:127.0.0.1'), true);
    assert.strictEqual(isPrivateIp('192.168.0.1'), true);
    assert.strictEqual(isPrivateIp('192.168.1.254'), true);
    assert.strictEqual(isPrivateIp('10.0.0.1'), true);
    assert.strictEqual(isPrivateIp('10.254.254.254'), true);
    assert.strictEqual(isPrivateIp('172.16.0.1'), true);
    assert.strictEqual(isPrivateIp('172.31.255.255'), true);
    assert.strictEqual(isPrivateIp('169.254.1.1'), true);
    assert.strictEqual(isPrivateIp('fe80::1'), true);
    assert.strictEqual(isPrivateIp('fc00::1'), true);
  });

  await it('rejects public internet IPs as non-private', () => {
    assert.strictEqual(isPrivateIp('175.136.12.34'), false);
    assert.strictEqual(isPrivateIp('8.8.8.8'), false);
    assert.strictEqual(isPrivateIp('1.1.1.1'), false);
    assert.strictEqual(isPrivateIp('81.2.69.142'), false);
    assert.strictEqual(isPrivateIp('128.199.100.1'), false);
  });

  console.log('\n3. Malaysian IPv4 Detection (isMalaysiaIp)');
  await it('identifies major Malaysian ISP public IP blocks', () => {
    assert.strictEqual(isMalaysiaIp('175.136.12.34'), true, 'TM Unifi must be recognized as Malaysia');
    assert.strictEqual(isMalaysiaIp('115.164.20.10'), true, 'TIME dotCom must be recognized as Malaysia');
    assert.strictEqual(isMalaysiaIp('113.210.5.5'), true, 'Maxis must be recognized as Malaysia');
    assert.strictEqual(isMalaysiaIp('110.159.200.5'), true, 'Celcom must be recognized as Malaysia');
  });

  await it('rejects foreign IPs from other countries', () => {
    assert.strictEqual(isMalaysiaIp('8.8.8.8'), false, 'Google DNS (US) must be rejected');
    assert.strictEqual(isMalaysiaIp('1.1.1.1'), false, 'Cloudflare DNS must be rejected');
    assert.strictEqual(isMalaysiaIp('81.2.69.142'), false, 'London UK IP must be rejected');
    assert.strictEqual(isMalaysiaIp('128.199.100.1'), false, 'DigitalOcean Singapore must be rejected');
    assert.strictEqual(isMalaysiaIp('192.168.1.1'), false, 'Private LAN IP must not be in public CIDR table');
  });

  console.log('\n4. Client IP Extraction (extractClientIp)');
  await it('prioritizes CF-Connecting-IP, X-Real-IP, and X-Forwarded-For properly', () => {
    const reqCf = { headers: { 'cf-connecting-ip': '175.136.1.1', 'x-forwarded-for': '8.8.8.8' } };
    assert.strictEqual(extractClientIp(reqCf), '175.136.1.1');

    const reqXReal = { headers: { 'x-real-ip': '115.164.1.1' } };
    assert.strictEqual(extractClientIp(reqXReal), '115.164.1.1');

    const reqXff = { headers: { 'x-forwarded-for': '113.210.1.1, 10.0.0.1' } };
    assert.strictEqual(extractClientIp(reqXff), '113.210.1.1');

    const reqDirect = { ip: '::ffff:192.168.0.5' };
    assert.strictEqual(extractClientIp(reqDirect), '192.168.0.5');
  });

  console.log('\n5. Custom Whitelist Evaluation (isWhitelisted)');
  await it('evaluates exact IP matches and CIDR notation subnets in whitelist', () => {
    const list = ['8.8.8.8', '195.154.0.0/16'];
    assert.strictEqual(isWhitelisted('8.8.8.8', list), true);
    assert.strictEqual(isWhitelisted('195.154.22.33', list), true);
    assert.strictEqual(isWhitelisted('8.8.4.4', list), false);
    assert.strictEqual(isWhitelisted('195.155.0.1', list), false);
  });

  console.log('\n6. Comprehensive Geo Access Logic (checkGeoAccess)');
  await it('permits all requests when geoBlockEnabled is false', async () => {
    const res = await checkGeoAccess('8.8.8.8', {}, { geoBlockEnabled: false });
    assert.strictEqual(res.allowed, true);
    assert.strictEqual(res.reason, 'geoblock_disabled');
  });

  await it('permits private LAN IPs unconditionally', async () => {
    const res = await checkGeoAccess('192.168.0.226', {}, { geoBlockEnabled: true });
    assert.strictEqual(res.allowed, true);
    assert.strictEqual(res.country, 'LOCAL');
  });

  await it('permits whitelisted foreign IPs', async () => {
    const res = await checkGeoAccess('8.8.8.8', {}, {
      geoBlockEnabled: true,
      geoBlockWhitelistedIps: ['8.8.8.8'],
    });
    assert.strictEqual(res.allowed, true);
    assert.strictEqual(res.country, 'WHITELIST');
  });

  await it('honors Cloudflare CF-IPCountry header: allows MY, blocks others', async () => {
    const resMy = await checkGeoAccess('8.8.8.8', { 'cf-ipcountry': 'MY' }, { geoBlockEnabled: true });
    assert.strictEqual(resMy.allowed, true);
    assert.strictEqual(resMy.country, 'MY');
    assert.strictEqual(resMy.reason, 'cloudflare_allowed');

    const resSg = await checkGeoAccess('175.136.12.34', { 'cf-ipcountry': 'SG' }, { geoBlockEnabled: true });
    assert.strictEqual(resSg.allowed, false);
    assert.strictEqual(resSg.country, 'SG');
    assert.strictEqual(resSg.reason, 'cloudflare_blocked');
  });

  await it('permits Malaysian IP via offline CIDR table without headers', async () => {
    const res = await checkGeoAccess('175.136.12.34', {}, { geoBlockEnabled: true });
    assert.strictEqual(res.allowed, true);
    assert.strictEqual(res.country, 'MY');
    assert.strictEqual(res.reason, 'malaysia_cidr_match');
  });

  await it('blocks foreign IP without Malaysian credentials', async () => {
    const res = await checkGeoAccess('81.2.69.142', {}, { geoBlockEnabled: true });
    assert.strictEqual(res.allowed, false);
  });

  console.log('\n7. Express Middleware Integration (createGeoBlockMiddleware)');
  await it('exempts /api/github-webhook from Geo-blocking', async () => {
    const middleware = createGeoBlockMiddleware(() => ({ geoBlockEnabled: true }));
    let nextCalled = false;
    const req = { path: '/api/github-webhook', headers: {} };
    const res = {};
    await middleware(req, res, () => { nextCalled = true; });
    assert.strictEqual(nextCalled, true, 'GitHub webhook must bypass Geo-block');
  });

  await it('allows Malaysian traffic to pass to next()', async () => {
    const middleware = createGeoBlockMiddleware(() => ({ geoBlockEnabled: true }));
    let nextCalled = false;
    const req = {
      path: '/api/resolve',
      headers: { 'cf-connecting-ip': '175.136.12.34' }
    };
    const res = {};
    await middleware(req, res, () => { nextCalled = true; });
    assert.strictEqual(nextCalled, true);
    assert.ok(req.geoInfo && req.geoInfo.allowed);
  });

  await it('returns 403 Forbidden with descriptive JSON on foreign IP', async () => {
    const middleware = createGeoBlockMiddleware(() => ({ geoBlockEnabled: true }));
    let statusCode = null;
    let jsonPayload = null;
    const req = {
      path: '/stream/12345',
      method: 'GET',
      originalUrl: '/stream/12345',
      headers: { 'cf-ipcountry': 'RU', 'cf-connecting-ip': '95.173.136.70' }
    };
    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(data) {
        jsonPayload = data;
        return this;
      }
    };
    let nextCalled = false;
    await middleware(req, res, () => { nextCalled = true; });
    assert.strictEqual(nextCalled, false, 'next() must NOT be called for blocked IP');
    assert.strictEqual(statusCode, 403);
    assert.strictEqual(jsonPayload.success, false);
    assert.strictEqual(jsonPayload.country, 'RU');
    assert.ok(jsonPayload.error.includes('Malaysia (MY)'));
  });

  console.log(`\nResults: ${passed}/${total} tests passed!\n`);
  if (passed === total) {
    console.log('🎉 ALL GEO-BLOCKING TESTS PASSED SUCCESSFULLY!\n');
  } else {
    process.exit(1);
  }
}

runTests();
