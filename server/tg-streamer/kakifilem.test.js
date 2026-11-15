/**
 * Kakifilem Resolver Test Suite (#343)
 * Module: server/tg-streamer/kakifilem.test.js
 * Tests: BVA (kosong / 1 / banyak hasil, EP vs filem), button scoring, branch coverage, registry
 */

import assert from 'assert';
import {
  listResolvers,
  getResolverClass,
  createResolver,
  KakifilemResolver,
} from './resolvers/index.js';
import {
  scoreKakifilemButton,
  findNextPageButton,
  botMessageState,
} from './resolvers/kakifilem.js';

let totalTests = 0;
let passedTests = 0;

async function test(name, fn) {
  totalTests++;
  try {
    await fn();
    passedTests++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(err);
    throw err;
  }
}

console.log('\n--- Kakifilem Resolver Test Suite (#343) ---\n');

// 1. Registry & Factory Integration
console.log('1. Registry & Factory Integration');

await test('listResolvers includes kakifilem resolver metadata', () => {
  const resolvers = listResolvers();
  const kf = resolvers.find(r => r.id === 'kakifilem');
  assert.ok(kf, 'kakifilem should be in listResolvers()');
  assert.strictEqual(kf.name, 'Kakifilem Bot');
  assert.strictEqual(kf.defaultBot, 'KakifilemBot');
});

await test('getResolverClass returns KakifilemResolver class (case-insensitive)', () => {
  assert.strictEqual(getResolverClass('kakifilem'), KakifilemResolver);
  assert.strictEqual(getResolverClass('KAKIFILEM'), KakifilemResolver);
  assert.strictEqual(getResolverClass('Kakifilem'), KakifilemResolver);
});

await test('createResolver instantiates KakifilemResolver with defaults', () => {
  const dummyClient = {};
  const resolver = createResolver('kakifilem', dummyClient, { targetBot: 'CustomBot' });
  assert.ok(resolver instanceof KakifilemResolver);
  assert.strictEqual(resolver.id, 'kakifilem');
  assert.strictEqual(resolver.name, 'Kakifilem Bot');
  assert.strictEqual(resolver.defaultBot, 'KakifilemBot');
  assert.strictEqual(resolver.options.targetBot, 'CustomBot');
});

// 2. Button Scoring & Format Parsing (scoreKakifilemButton)
console.log('\n2. Button Scoring & Format Parsing (scoreKakifilemButton)');

await test('correctly scores TV episode button matching "Mr.London.Ms.Langkawi.EP4 (210.9 MB)"', () => {
  const evalContext = {
    isTv: true,
    title: 'Mr. London Ms. Langkawi',
    sNum: 1,
    eNum: 4,
    significantTokens: ['mr', 'london', 'ms', 'langkawi'],
    minTvSizeMb: 80,
    minMovieSizeMb: 180,
  };

  const btn = {
    className: 'KeyboardButtonCallback',
    text: 'Mr.London.Ms.Langkawi.EP4 (210.9 MB)',
    data: Buffer.from('file_ep4'),
  };

  const res = scoreKakifilemButton(btn, null, evalContext);
  assert.ok(res.score >= 0, `Expected score >= 0, got ${res.score} (${res.reason})`);
  assert.ok(res.reason.includes('accepted'));
});

await test('disqualifies mismatched episode button (requesting Ep 1 when button is Ep 4)', () => {
  const evalContext = {
    isTv: true,
    title: 'Mr. London Ms. Langkawi',
    sNum: 1,
    eNum: 1,
    significantTokens: ['mr', 'london', 'ms', 'langkawi'],
    minTvSizeMb: 80,
    minMovieSizeMb: 180,
  };

  const btn = {
    className: 'KeyboardButtonCallback',
    text: 'Mr.London.Ms.Langkawi.EP4 (210.9 MB)',
    data: Buffer.from('file_ep4'),
  };

  const res = scoreKakifilemButton(btn, null, evalContext);
  assert.strictEqual(res.score, -999, 'Expected hard disqualification for episode mismatch');
  assert.ok(res.reason.includes('episode mismatch'));
});

await test('correctly scores movie button with year and size "Polis.Evo.3.2023.1080p (1.8 GB)"', () => {
  const evalContext = {
    isTv: false,
    title: 'Polis Evo 3',
    year: '2023',
    significantTokens: ['polis', 'evo', '3'],
    targetQuality: 1080,
    minTvSizeMb: 80,
    minMovieSizeMb: 180,
  };

  const btn = {
    className: 'KeyboardButtonCallback',
    text: 'Polis.Evo.3.2023.1080p (1.8 GB)',
    data: Buffer.from('file_polis3'),
  };

  const res = scoreKakifilemButton(btn, null, evalContext);
  assert.ok(res.score >= 0, `Expected score >= 0, got ${res.score} (${res.reason})`);
  assert.strictEqual(res.tier, '1080p');
});

await test('rejects movie below minMovieSizeMb threshold (BVA: 50 MB sample vs 180 MB threshold)', () => {
  const evalContext = {
    isTv: false,
    title: 'Polis Evo 3',
    year: '2023',
    significantTokens: ['polis', 'evo', '3'],
    minMovieSizeMb: 180,
  };

  const btn = {
    className: 'KeyboardButtonCallback',
    text: 'Polis.Evo.3.2023.Sample (50 MB)',
    data: Buffer.from('file_sample'),
  };

  const res = scoreKakifilemButton(btn, null, evalContext);
  assert.strictEqual(res.score, -999);
  assert.ok(res.reason.includes('below minimum') || res.reason.includes('junk'));
});

await test('rejects TV episode below minTvSizeMb threshold (BVA: 30 MB promo vs 80 MB threshold)', () => {
  const evalContext = {
    isTv: true,
    title: 'Mr. London Ms. Langkawi',
    sNum: 1,
    eNum: 4,
    significantTokens: ['mr', 'london', 'ms', 'langkawi'],
    minTvSizeMb: 80,
  };

  const btn = {
    className: 'KeyboardButtonCallback',
    text: 'Mr.London.Ms.Langkawi.EP4 (30 MB)',
    data: Buffer.from('file_promo'),
  };

  const res = scoreKakifilemButton(btn, null, evalContext);
  assert.strictEqual(res.score, -999);
  assert.ok(res.reason.includes('below minimum'));
});

await test('supports KeyboardButtonUrl and KeyboardButtonUrlAuth in addition to KeyboardButtonCallback', () => {
  const evalContext = {
    isTv: false,
    title: 'Kahar Kapla High Council',
    year: '2024',
    significantTokens: ['kahar', 'kapla', 'high', 'council'],
    minMovieSizeMb: 180,
  };

  const cbBtn = {
    className: 'KeyboardButtonCallback',
    text: 'Kahar.Kapla.High.Council.2024.1080p (2.1 GB)',
    data: Buffer.from('data1'),
  };
  const urlBtn = {
    className: 'KeyboardButtonUrl',
    text: 'Kahar.Kapla.High.Council.2024.1080p (2.1 GB)',
    url: 'https://t.me/KakifilemBot?start=kahar1080',
  };
  const authBtn = {
    className: 'KeyboardButtonUrlAuth',
    text: 'Kahar.Kapla.High.Council.2024.1080p (2.1 GB)',
    url: 'https://auth.example.com/link',
    buttonId: 101,
  };
  const unsupportedBtn = {
    className: 'KeyboardButtonRequestPhone',
    text: 'Send Phone',
  };

  assert.ok(scoreKakifilemButton(cbBtn, null, evalContext).score >= 0);
  assert.ok(scoreKakifilemButton(urlBtn, null, evalContext).score >= 0);
  assert.ok(scoreKakifilemButton(authBtn, null, evalContext).score >= 0);
  assert.strictEqual(scoreKakifilemButton(unsupportedBtn, null, evalContext).score, -999);
  assert.strictEqual(scoreKakifilemButton(null, null, evalContext).score, -999);
});

await test('disqualifies junk media (trailer, sample, preview)', () => {
  const evalContext = {
    isTv: false,
    title: 'Mat Kilau',
    significantTokens: ['mat', 'kilau'],
    minMovieSizeMb: 10,
  };

  const trailerBtn = {
    className: 'KeyboardButtonCallback',
    text: 'Mat.Kilau.Official.Trailer (25 MB)',
    data: Buffer.from('trailer'),
  };

  const res = scoreKakifilemButton(trailerBtn, null, evalContext);
  assert.strictEqual(res.score, -999);
  assert.ok(res.reason.includes('junk media'));
});

// 3. Boundary Value Analysis (BVA) for Search Results & Resolver Flow
console.log('\n3. Boundary Value Analysis (BVA) for Search Results & Resolver Flow');

await test('BVA 0 results (kosong): bot returns "tiada carian" immediately ends query without looping', async () => {
  let sentCount = 0;
  const mockClient = {
    sendMessage: async (bot, opts) => {
      sentCount++;
      return { id: 100 + sentCount };
    },
    getMessages: async (bot, opts) => {
      return [{
        id: 200,
        message: 'Tiada carian dijumpai untuk tajuk ini.',
        replyMarkup: null,
      }];
    },
  };

  const resolver = new KakifilemResolver(mockClient, {
    pollDelayMs: 20,
  });
  const result = await resolver.resolve({
    title: 'NonExistentTitleXYZ123',
    year: '2026',
  });

  assert.strictEqual(result, null, 'Should return null when 0 results found');
});

await test('BVA 1 result: single matching candidate triggers delivery and returns stream record', async () => {
  let callbackInvoked = false;
  let targetData = null;

  const mockClient = {
    sendMessage: async (bot, opts) => ({ id: 50 }),
    invoke: async (request) => {
      if (request.className?.includes('GetBotCallbackAnswer')) {
        callbackInvoked = true;
        targetData = request.data;
        return { ok: true };
      }
      return {};
    },
    getMessages: async (bot, opts) => {
      if (opts?.limit === 5) {
        // Search response with 1 result
        return [{
          id: 55,
          message: 'Hasil carian:',
          replyMarkup: {
            rows: [{
              buttons: [{
                className: 'KeyboardButtonCallback',
                text: 'Mr.London.Ms.Langkawi.EP4 (210.9 MB)',
                data: Buffer.from('stream_token_123'),
              }],
            }],
          },
        }];
      }
      if (opts?.limit === 10) {
        // Media delivery response after callback
        return [{
          id: 60,
          message: 'Mr.London.Ms.Langkawi.EP4.mp4 @kakifilembot',
          media: {
            document: {
              id: '99887766',
              size: 221145088, // ~210.9 MB
              attributes: [
                { className: 'DocumentAttributeFilename', fileName: 'Mr.London.Ms.Langkawi.EP4.mp4' },
                { className: 'DocumentAttributeVideo', duration: 2400, w: 1280, h: 720 },
              ],
            },
          },
        }];
      }
      return [];
    },
  };

  const resolver = new KakifilemResolver(mockClient, {
    pollDelayMs: 20,
  });
  const res = await resolver.resolve({
    title: 'Mr. London Ms. Langkawi',
    season: 1,
    episode: 4,
  });

  assert.ok(res, 'Should resolve candidate successfully');
  assert.ok(callbackInvoked, 'Should have invoked GetBotCallbackAnswer');
  assert.strictEqual(res.filename, 'Mr.London.Ms.Langkawi.EP4.mp4');
  assert.strictEqual(res.document.id, '99887766');
  assert.strictEqual(res.bot, 'KakifilemBot');
  assert.strictEqual(res.tier, '720p');
});

await test('BVA banyak hasil (multiple results): selects highest scoring candidate matching exact episode and quality', async () => {
  let invokedData = null;

  const mockClient = {
    sendMessage: async (bot, opts) => ({ id: 10 }),
    invoke: async (request) => {
      if (request.className?.includes('GetBotCallbackAnswer')) {
        invokedData = request.data.toString();
        return { ok: true };
      }
      return {};
    },
    getMessages: async (bot, opts) => {
      if (opts?.limit === 5) {
        // Multiple episode buttons in response
        return [{
          id: 15,
          message: 'Hasil carian:',
          replyMarkup: {
            rows: [
              {
                buttons: [
                  { className: 'KeyboardButtonCallback', text: 'Mr.London.Ms.Langkawi.EP1 (210 MB)', data: Buffer.from('ep1_data') },
                  { className: 'KeyboardButtonCallback', text: 'Mr.London.Ms.Langkawi.EP2 (215 MB)', data: Buffer.from('ep2_data') },
                ],
              },
              {
                buttons: [
                  { className: 'KeyboardButtonCallback', text: 'Mr.London.Ms.Langkawi.EP3 (220 MB)', data: Buffer.from('ep3_data') },
                  { className: 'KeyboardButtonCallback', text: 'Mr.London.Ms.Langkawi.EP4 (210.9 MB)', data: Buffer.from('ep4_target_data') },
                ],
              },
            ],
          },
        }];
      }
      if (opts?.limit === 10) {
        return [{
          id: 20,
          message: 'Video delivered',
          media: {
            document: {
              id: 'doc_ep4',
              size: 221145088,
              attributes: [
                { className: 'DocumentAttributeFilename', fileName: 'Mr.London.Ms.Langkawi.EP4.mp4' },
                { className: 'DocumentAttributeVideo', duration: 2500, w: 1280, h: 720 },
              ],
            },
          },
        }];
      }
      return [];
    },
  };

  const resolver = new KakifilemResolver(mockClient, {
    pollDelayMs: 20,
  });
  const res = await resolver.resolve({
    title: 'Mr. London Ms. Langkawi',
    season: 1,
    episode: 4,
  });

  assert.ok(res, 'Should resolve target episode');
  assert.strictEqual(invokedData, 'ep4_target_data', 'Expected exact ep4 candidate data to be invoked');
  assert.strictEqual(res.document.id, 'doc_ep4');
});

// 4. Branch Coverage & Edge Cases
console.log('\n4. Branch Coverage & Edge Cases');

await test('handles KeyboardButtonUrl with start parameter by sending /start <param>', async () => {
  let startMsgSent = null;

  const mockClient = {
    sendMessage: async (bot, opts) => {
      if (opts.message?.startsWith('/start')) {
        startMsgSent = opts.message;
        return { id: 80 };
      }
      return { id: 70 };
    },
    invoke: async () => ({}),
    getMessages: async (bot, opts) => {
      if (opts?.limit === 5) {
        return [{
          id: 72,
          message: 'Bot results:',
          replyMarkup: {
            rows: [{
              buttons: [{
                className: 'KeyboardButtonUrl',
                text: 'Polis.Evo.3.2023.1080p (1.8 GB)',
                url: 'https://t.me/KakifilemBot?start=file_token_polis3',
              }],
            }],
          },
        }];
      }
      if (opts?.limit === 10) {
        return [{
          id: 85,
          message: 'Delivery',
          media: {
            document: {
              id: 'doc_polis3',
              size: 1932735283,
              attributes: [{ className: 'DocumentAttributeFilename', fileName: 'Polis.Evo.3.2023.1080p.mkv' }],
            },
          },
        }];
      }
      return [];
    },
  };

  const resolver = new KakifilemResolver(mockClient, {
    pollDelayMs: 20,
  });
  const res = await resolver.resolve({
    title: 'Polis Evo 3',
    year: '2023',
  });

  assert.ok(res);
  assert.strictEqual(startMsgSent, '/start file_token_polis3');
  assert.strictEqual(res.document.id, 'doc_polis3');
});

await test('findNextPageButton recognizes pagination buttons', () => {
  const markupWithNext = {
    rows: [{
      buttons: [
        { className: 'KeyboardButtonCallback', text: '1', data: Buffer.from('p1') },
        { className: 'KeyboardButtonCallback', text: 'Next ➡️', data: Buffer.from('next_page') },
      ],
    }],
  };
  const markupWithoutNext = {
    rows: [{
      buttons: [
        { className: 'KeyboardButtonCallback', text: 'Close', data: Buffer.from('close') },
      ],
    }],
  };

  assert.ok(findNextPageButton(markupWithNext));
  assert.strictEqual(findNextPageButton(markupWithoutNext), null);
  assert.strictEqual(findNextPageButton(null), null);
});

await test('botMessageState creates consistent fingerprint for reply state deduplication', () => {
  const msg1 = {
    id: 123,
    editDate: 0,
    replyMarkup: {
      rows: [{
        buttons: [{ text: 'Button A' }, { text: 'Button B' }],
      }],
    },
  };
  const msg2 = {
    id: 123,
    editDate: 0,
    replyMarkup: {
      rows: [{
        buttons: [{ text: 'Button A' }, { text: 'Button B' }],
      }],
    },
  };
  assert.strictEqual(botMessageState(msg1), botMessageState(msg2));
});

await test('aborts gracefully and throws 499 status error when checkAborted is triggered', async () => {
  let checks = 0;
  const mockClient = {
    sendMessage: async () => ({ id: 1 }),
    getMessages: async () => [],
  };

  const resolver = new KakifilemResolver(mockClient, {
    pollDelayMs: 20,
  });
  await assert.rejects(
    async () => {
      await resolver.resolve({
        title: 'Any Movie',
        checkAborted: () => {
          checks++;
          return checks >= 2;
        },
      });
    },
    (err) => err.status === 499
  );
});

await test('custom targetBot override via options and params is respected (not hardcoded to KakifilemBot)', async () => {
  let targetBotQueried = null;
  const mockClient = {
    sendMessage: async (bot, opts) => {
      targetBotQueried = bot;
      return { id: 10 };
    },
    getMessages: async (bot) => {
      return [{
        id: 11,
        message: 'No results found',
      }];
    },
  };

  // 1. Via options
  const resolverWithOptions = new KakifilemResolver(mockClient, { targetBot: 'CustomOptionsBot' });
  await resolverWithOptions.resolve({ title: 'Test Movie' });
  assert.strictEqual(targetBotQueried, 'CustomOptionsBot');

  // 2. Via params override
  const resolverDefault = new KakifilemResolver(mockClient);
  await resolverDefault.resolve({ title: 'Test Movie', targetBot: 'CustomParamsBot' });
  assert.strictEqual(targetBotQueried, 'CustomParamsBot');
});

// 5. Real Bot Fixtures & Delivery Bot Flow (#HOM-188)
console.log('\n5. Real Bot Fixtures & Delivery Bot Flow (#HOM-188)');

await test('resolves media via web delivery link (bot.kakifilem.com) and accepts generic Telegram video filename', async () => {
  let sendVideoPayload = null;
  const realBotReply = {
    id: 100,
    message: '🔍 Found 1 results for Mr London Ms Langkawi EP11\n⚡️ Cache (4.4ms)\n📄 Page 1/1 • Showing 1 results',
    replyMarkup: {
      className: 'ReplyInlineMarkup',
      rows: [
        {
          className: 'KeyboardButtonRow',
          buttons: [
            {
              className: 'KeyboardButtonUrl',
              text: '🎬 Mr.London.Ms.Langkawi.EP11 (182.3 MB)',
              url: 'https://bot.kakifilem.com/mock-link-11',
            },
          ],
        },
      ],
    },
  };

  const deliveredMsg = {
    id: 105,
    message: '🎬 Mr London Malay Langkawi EP11  📤 @kakifilembot',
    media: {
      className: 'MessageMediaDocument',
      document: {
        id: '7025249007176585216',
        size: 191155814,
        mimeType: 'video/mp4',
        attributes: [
          { className: 'DocumentAttributeFilename', fileName: 'video_2021-10-31_15-05-34_7025249007176585216.mp4' },
        ],
      },
    },
  };

  let deliveryTriggered = false;
  const mockClient = {
    sendMessage: async (bot, opts) => ({ id: 99 }),
    getMessages: async (bot, opts) => {
      if (opts?.limit === 5) return [realBotReply];
      if (opts?.limit === 10) return deliveryTriggered ? [deliveredMsg] : [];
      return [];
    },
  };

  // Mock web delivery endpoint for bot.kakifilem.com
  const mockWebDelivery = async (url, postFn) => {
    deliveryTriggered = true;
  };

  const resolver = new KakifilemResolver(mockClient, {
    webDeliveryTrigger: mockWebDelivery,
    pollDelayMs: 20,
  });

  const res = await resolver.resolve({
    title: 'Mr London Ms Langkawi',
    season: 1,
    episode: 11,
  });

  assert.ok(res, 'Expected successful stream resolution for real bot fixture');
  assert.strictEqual(res.document.id, '7025249007176585216');
  assert.ok(res.filename.includes('Mr.London.Ms.Langkawi.EP11') || res.filename.includes('Mr London Ms Langkawi'));
});

await test('parses delivery bot from Telegram link (e.g. *.t.me or t.me/<bot>) and delivers via delivery bot', async () => {
  let deliveryBotTarget = null;
  let deliveryBotStartMessage = null;

  const suggestionReply = {
    id: 200,
    message: '😕 Kami tak jumpa filem yang sepadan dengan carian anda...',
    replyMarkup: {
      className: 'ReplyInlineMarkup',
      rows: [
        {
          className: 'KeyboardButtonRow',
          buttons: [
            {
              className: 'KeyboardButtonUrl',
              text: 'Mr London Ms Langkawi EP11',
              url: 'https://customdeliverybot.t.me/?start=s_Mr_London_Ms_Langkawi_EP11',
            },
          ],
        },
      ],
    },
  };

  const deliveredMsg = {
    id: 50,
    message: '🎬 Mr London Ms Langkawi EP11',
    media: {
      className: 'MessageMediaDocument',
      document: {
        id: '8888888888',
        size: 191155814,
        mimeType: 'video/mp4',
        attributes: [
          { className: 'DocumentAttributeFilename', fileName: 'Mr.London.Ms.Langkawi.EP11.mp4' },
        ],
      },
    },
  };

  let startSent = false;
  const mockClient = {
    sendMessage: async (bot, opts) => {
      if (bot === 'customdeliverybot') {
        deliveryBotTarget = bot;
        deliveryBotStartMessage = opts?.message;
        startSent = true;
      }
      return { id: 10 };
    },
    getMessages: async (bot, opts) => {
      if (bot === 'KakifilemBot') return [suggestionReply];
      if (bot === 'customdeliverybot') {
        if (!startSent) return [{ id: 40, message: 'baseline' }];
        return [deliveredMsg];
      }
      return [];
    },
  };

  const resolver = new KakifilemResolver(mockClient, {
    pollDelayMs: 20,
  });
  const res = await resolver.resolve({
    title: 'Mr London Ms Langkawi',
    season: 1,
    episode: 11,
  });

  assert.ok(res, 'Expected successful stream resolution via custom delivery bot');
  assert.strictEqual(deliveryBotTarget, 'customdeliverybot');
  assert.strictEqual(deliveryBotStartMessage, '/start s_Mr_London_Ms_Langkawi_EP11');
  assert.strictEqual(res.document.id, '8888888888');
});

console.log(`\nResults: ${passedTests}/${totalTests} kakifilem tests passed!\n`);
console.log('🎉 ALL KAKIFILEM UNIT TESTS PASSED SUCCESSFULLY!\n');
