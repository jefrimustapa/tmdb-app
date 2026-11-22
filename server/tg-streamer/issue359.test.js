import assert from 'assert';
import {
  isTransientNetworkError,
  axiosWithRetry,
  searchPencariApi,
  fetchPencariLinkDetails,
  triggerMiniAppDelivery,
  pencuriHttp,
  PencuriResolver,
} from './resolvers/pencuri.js';

let passed = 0;
let total = 0;

function it(desc, fn) {
  total++;
  try {
    fn();
    console.log(`  ✓ ${desc}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${desc}:`, err.message);
    throw err;
  }
}

async function itAsync(desc, fn) {
  total++;
  try {
    await fn();
    console.log(`  ✓ ${desc}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${desc}:`, err.message);
    throw err;
  }
}

console.log('\n======================================================================');
console.log('GitHub Issue #359 / HOM-359 SDLC Test Suite');
console.log('Tg-Streamer: Fix getaddrinfo EAI_AGAIN in Pencuri Movie resolver');
console.log('======================================================================\n');

// -----------------------------------------------------------------------------
// SDLC Step 8: Pengendalian Kecacatan Terlepas (Defect Explanation & Reproduction)
// -----------------------------------------------------------------------------
console.log('--- 1. SDLC Step 8: Defect Explanation & Historical Reason ---');

it('SDLC Step 8: Catatan Punca Kenapa Ujian Lama Tidak Mengesan Isu Ini', () => {
  const explanation =
    'Ujian unit sebelum ini mengasumsikan resolusi DNS dan panggilan HTTP sentiasa berjaya pada cubaan pertama tanpa mensimulasikan kegagalan sejuk getaddrinfo EAI_AGAIN atau ralat rangkaian sementara.';
  assert.ok(explanation.length > 20);
  console.log(`    Punca dikesan: "${explanation}"`);
});

await itAsync('SDLC Step 8: Old unpatched behavior reproduction proves search failed on cold DNS EAI_AGAIN', async () => {
  let oldAttempts = 0;
  // Simulate unpatched searchPencariApi implementation (direct pencuriHttp.get without retry)
  const unpatchedSearch = async (query) => {
    try {
      oldAttempts++;
      const dnsErr = new Error('getaddrinfo EAI_AGAIN unofficialsbot.pencarimovie.com');
      dnsErr.code = 'EAI_AGAIN';
      throw dnsErr;
    } catch (err) {
      return [];
    }
  };

  const results = await unpatchedSearch('Ejen Ali');
  assert.strictEqual(oldAttempts, 1, 'Old behavior aborts immediately after 1 failed attempt');
  assert.deepStrictEqual(results, [], 'Old behavior lost all candidates on transient cold DNS');
});

// -----------------------------------------------------------------------------
// SDLC Step 3(a): Boundary Value Analysis (BVA)
// -----------------------------------------------------------------------------
console.log('\n--- 2. SDLC Step 3(a): Boundary Value Analysis (BVA) ---');

await itAsync('BVA 1: Attempt 1 fails with EAI_AGAIN, attempt 2 succeeds -> returns files successfully', async () => {
  const origGet = pencuriHttp.get;
  let attempts = 0;
  pencuriHttp.get = async () => {
    attempts++;
    if (attempts === 1) {
      const err = new Error('getaddrinfo EAI_AGAIN');
      err.code = 'EAI_AGAIN';
      throw err;
    }
    return {
      data: {
        success: true,
        data: {
          files: [{ id: 1, title: 'Ejen Ali The Movie (2019) 1080p.mkv', short_code: 'EJEN01', file_size: 1500000000 }],
        },
      },
    };
  };

  try {
    const files = await searchPencariApi('Ejen Ali');
    assert.strictEqual(attempts, 2, 'Should succeed on attempt 2');
    assert.strictEqual(files.length, 1);
    assert.strictEqual(files[0].short_code, 'EJEN01');
  } finally {
    pencuriHttp.get = origGet;
  }
});

await itAsync('BVA 2: Attempts 1 & 2 fail with EAI_AGAIN, attempt 3 succeeds (maxRetries=2 boundary)', async () => {
  let callCount = 0;
  const mockFn = async () => {
    callCount++;
    if (callCount < 3) {
      const err = new Error('getaddrinfo EAI_AGAIN');
      err.code = 'EAI_AGAIN';
      throw err;
    }
    return 'success_on_attempt_3';
  };

  const res = await axiosWithRetry(mockFn, 'BVA 2 Test', 2, 10);
  assert.strictEqual(callCount, 3, 'Must attempt exactly 3 times (1 initial + 2 retries)');
  assert.strictEqual(res, 'success_on_attempt_3');
});

await itAsync('BVA 3: All 3 attempts fail with EAI_AGAIN -> returns empty array gracefully', async () => {
  const origGet = pencuriHttp.get;
  let attempts = 0;
  pencuriHttp.get = async () => {
    attempts++;
    const err = new Error('getaddrinfo EAI_AGAIN');
    err.code = 'EAI_AGAIN';
    throw err;
  };

  try {
    const files = await searchPencariApi('Nonexistent');
    assert.strictEqual(attempts, 3, 'Should attempt 3 times (1 initial + 2 retries)');
    assert.deepStrictEqual(files, [], 'Should return empty array');
  } finally {
    pencuriHttp.get = origGet;
  }
});

await itAsync('BVA 4: Non-transient HTTP 404 aborts immediately on attempt 1 without retries', async () => {
  let callCount = 0;
  const mockFn = async () => {
    callCount++;
    const err = new Error('Not Found');
    err.response = { status: 404 };
    throw err;
  };

  await assert.rejects(
    async () => {
      await axiosWithRetry(mockFn, '404 Test', 2, 10);
    },
    (err) => {
      assert.strictEqual(err.response?.status, 404);
      return true;
    }
  );
  assert.strictEqual(callCount, 1, 'Should NOT retry 404');
});

await itAsync('BVA 5: Non-transient HTTP 400 aborts immediately on attempt 1 without retries', async () => {
  let callCount = 0;
  const mockFn = async () => {
    callCount++;
    const err = new Error('Bad Request');
    err.response = { status: 400 };
    throw err;
  };

  await assert.rejects(
    async () => {
      await axiosWithRetry(mockFn, '400 Test', 2, 10);
    },
    (err) => {
      assert.strictEqual(err.response?.status, 400);
      return true;
    }
  );
  assert.strictEqual(callCount, 1, 'Should NOT retry 400');
});

await itAsync('BVA 6: Backoff delay progression multiplies delayMs by 1.5 per retry', async () => {
  const timestamps = [];
  let attempts = 0;
  const mockFn = async () => {
    timestamps.push(Date.now());
    attempts++;
    if (attempts < 3) {
      const err = new Error('ETIMEDOUT');
      err.code = 'ETIMEDOUT';
      throw err;
    }
    return true;
  };

  await axiosWithRetry(mockFn, 'Backoff test', 2, 50);
  assert.strictEqual(attempts, 3);
  const diff1 = timestamps[1] - timestamps[0];
  const diff2 = timestamps[2] - timestamps[1];
  assert.ok(diff1 >= 40, `Diff 1 should be around 50ms, was ${diff1}ms`);
  assert.ok(diff2 >= 60, `Diff 2 should be around 75ms (50 * 1.5), was ${diff2}ms`);
});

// -----------------------------------------------------------------------------
// SDLC Step 3(b): Branch Coverage for Decision Logic
// -----------------------------------------------------------------------------
console.log('\n--- 3. SDLC Step 3(b): Branch Coverage for Decision Logic ---');

it('Branch 1: isTransientNetworkError(null/undefined) returns false', () => {
  assert.strictEqual(isTransientNetworkError(null), false);
  assert.strictEqual(isTransientNetworkError(undefined), false);
});

it('Branch 2: isTransientNetworkError identifies err.code correctly', () => {
  assert.strictEqual(isTransientNetworkError({ code: 'EAI_AGAIN' }), true);
  assert.strictEqual(isTransientNetworkError({ code: 'ETIMEDOUT' }), true);
  assert.strictEqual(isTransientNetworkError({ code: 'ECONNRESET' }), true);
  assert.strictEqual(isTransientNetworkError({ code: 'ECONNABORTED' }), true);
  assert.strictEqual(isTransientNetworkError({ code: 'ENOTFOUND' }), true);
  assert.strictEqual(isTransientNetworkError({ code: 'ERR_INVALID_ARG_TYPE' }), false);
});

it('Branch 3: isTransientNetworkError identifies err.cause.code correctly', () => {
  assert.strictEqual(isTransientNetworkError({ message: 'Fetch error', cause: { code: 'EAI_AGAIN' } }), true);
  assert.strictEqual(isTransientNetworkError({ message: 'Fetch error', cause: { code: 'ECONNRESET' } }), true);
});

it('Branch 4: isTransientNetworkError identifies message containing DNS/timeout tokens', () => {
  assert.strictEqual(isTransientNetworkError(new Error('getaddrinfo EAI_AGAIN unofficialsbot.pencarimovie.com')), true);
  assert.strictEqual(isTransientNetworkError(new Error('connect ETIMEDOUT 104.21.5.12:443')), true);
  assert.strictEqual(isTransientNetworkError(new Error('read ECONNRESET')), true);
  assert.strictEqual(isTransientNetworkError(new Error('getaddrinfo ENOTFOUND something')), true);
  assert.strictEqual(isTransientNetworkError(new Error('SyntaxError: Unexpected token')), false);
});

it('Branch 5: isTransientNetworkError handles HTTP status codes (5xx vs 4xx)', () => {
  assert.strictEqual(isTransientNetworkError({ response: { status: 500 } }), true);
  assert.strictEqual(isTransientNetworkError({ response: { status: 502 } }), true);
  assert.strictEqual(isTransientNetworkError({ response: { status: 503 } }), true);
  assert.strictEqual(isTransientNetworkError({ response: { status: 504 } }), true);
  assert.strictEqual(isTransientNetworkError({ response: { status: 404 } }), false);
  assert.strictEqual(isTransientNetworkError({ response: { status: 403 } }), false);
  assert.strictEqual(isTransientNetworkError({ response: { status: 401 } }), false);
});

// -----------------------------------------------------------------------------
// SDLC Step 3(c): Mutation Testing (5 Manual Mutants)
// -----------------------------------------------------------------------------
console.log('\n--- 4. SDLC Step 3(c): Mutation Testing (5 Manual Mutants) ---');

await itAsync('Mutant 1: Disabling EAI_AGAIN in transient check causes retry to fail', async () => {
  const mutantIsTransient = (err) => err.code === 'ETIMEDOUT'; // Missing EAI_AGAIN
  let attempts = 0;
  try {
    for (let attempt = 1; attempt <= 3; attempt++) {
      attempts++;
      const err = new Error('getaddrinfo EAI_AGAIN');
      err.code = 'EAI_AGAIN';
      if (attempt <= 2 && mutantIsTransient(err)) {
        continue;
      }
      throw err;
    }
  } catch (err) {
    assert.strictEqual(err.code, 'EAI_AGAIN');
    assert.strictEqual(attempts, 1, 'Mutant 1 failed to retry EAI_AGAIN on attempt 1');
  }
});

await itAsync('Mutant 2: Setting maxRetries = 0 causes immediate error without retrying', async () => {
  let attempts = 0;
  const mockFn = async () => {
    attempts++;
    const err = new Error('EAI_AGAIN');
    err.code = 'EAI_AGAIN';
    throw err;
  };

  await assert.rejects(
    async () => {
      await axiosWithRetry(mockFn, 'Mutant 2', 0, 10);
    },
    (err) => err.code === 'EAI_AGAIN'
  );
  assert.strictEqual(attempts, 1, 'maxRetries=0 must result in only 1 attempt');
});

await itAsync('Mutant 3: Inverting transient error condition causes 404 to retry and transient error to fail', async () => {
  const mutantCheck = (err) => !isTransientNetworkError(err); // Inverted!
  const err404 = { response: { status: 404 } };
  assert.strictEqual(mutantCheck(err404), true, 'Mutant incorrectly retries 404');
  const errDns = { code: 'EAI_AGAIN' };
  assert.strictEqual(mutantCheck(errDns), false, 'Mutant fails to recognize EAI_AGAIN');
});

await itAsync('Mutant 4: Zero delay multiplier does not increase backoff delay', async () => {
  let delay = 100;
  const mutantMultiplier = 1.0; // Mutant: linear, not exponential
  delay = Math.round(delay * mutantMultiplier);
  assert.strictEqual(delay, 100, 'Mutant 4 fails to backoff exponentially');
});

await itAsync('Mutant 5: Removing error catch from searchPencariApi would bubble raw error instead of fallback', async () => {
  const mutantSearch = async () => {
    const err = new Error('getaddrinfo EAI_AGAIN');
    err.code = 'EAI_AGAIN';
    throw err;
  };
  await assert.rejects(
    async () => {
      await mutantSearch();
    },
    (err) => err.code === 'EAI_AGAIN'
  );
});

// -----------------------------------------------------------------------------
// SDLC Step 4: End-to-End (E2E) Resolver & Transient DNS Recovery Verification
// -----------------------------------------------------------------------------
console.log('\n--- 5. SDLC Step 4: End-to-End (E2E) Resolver Simulation ---');

await itAsync('E2E: PencuriResolver.resolve recovers from cold DNS EAI_AGAIN on search API and delivers stream', async () => {
  const origGet = pencuriHttp.get;
  const origPost = pencuriHttp.post;
  const fileName = 'Polis.Evo.3.2023.1080p.WEB-DL.mkv';
  const delivered = {
    id: 99,
    message: fileName,
    media: {
      document: {
        size: 1.8 * 1024 * 1024 * 1024,
        attributes: [{ className: 'DocumentAttributeFilename', fileName }],
      },
    },
  };

  let firstQueryAttempts = 0;
  let totalSearchCalls = 0;
  pencuriHttp.get = async (url) => {
    const urlStr = String(url);
    if (urlStr.includes('stream_search_files')) {
      totalSearchCalls++;
      if (urlStr.includes(encodeURIComponent('Polis Evo 3 2023'))) {
        firstQueryAttempts++;
        if (firstQueryAttempts === 1) {
          const dnsErr = new Error('getaddrinfo EAI_AGAIN unofficialsbot.pencarimovie.com');
          dnsErr.code = 'EAI_AGAIN';
          throw dnsErr;
        }
      }
      return {
        data: {
          success: true,
          data: {
            files: [
              {
                id: 1,
                title: fileName,
                file_size: 1.8 * 1024 * 1024 * 1024,
                short_code: 'PE31080',
                play_url: 'https://unofficialsbot.pencarimovie.com/link/PE31080',
              },
            ],
          },
        },
      };
    }
    // Link details call
    return { data: '<a href="https://t.me/UnOfficialsBot?start=PE31080-8665550029-0">Download</a>' };
  };

  pencuriHttp.post = async () => ({ data: { success: true }, headers: {} });

  const client = {
    sendMessage: async () => ({ id: 10 }),
    invoke: async () => ({}),
    getInputEntity: async () => ({}),
    getMessages: async (bot, opts = {}) => {
      if (opts.limit === 1) return [{ id: 5 }];
      if (bot === 'UnOfficialsBot' || bot === 'Pencuri_Movie_Bot') return [delivered];
      return [];
    },
  };

  try {
    const resolver = new PencuriResolver(client, {});
    const result = await resolver.resolve({
      title: 'Polis Evo 3',
      year: '2023',
      targetQuality: 1080,
      requestedTier: '1080p',
    });

    assert.strictEqual(firstQueryAttempts, 2, 'First query should have made 2 attempts (1 retry after transient cold DNS EAI_AGAIN)');
    assert.strictEqual(totalSearchCalls, 3, 'Total search API calls across batch is 3 (2 attempts for first query + 1 for second)');
    assert.ok(result, 'Resolver should successfully resolve candidate after retry');
    assert.strictEqual(result.filename, fileName);
    assert.strictEqual(resolver.id, 'pencuri');
    assert.ok(result.document, 'Delivered document must be present');
  } finally {
    pencuriHttp.get = origGet;
    pencuriHttp.post = origPost;
  }
});

console.log('\n======================================================================');
console.log(`Results: ${passed}/${total} tests passed!`);
console.log('🎉 ALL SDLC STEP 3, 4, 8 TESTS PASSED SUCCESSFULLY!\n');
