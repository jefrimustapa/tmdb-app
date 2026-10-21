/**
 * Pencuri Resolver - Telegram Stream Resolver for @Pencuri_Movie_Bot & @UnOfficialsBot
 * Module: server/tg-streamer/resolvers/pencuri.js
 */

import { Api } from 'telegram';
import axios from 'axios';
import {
  BaseResolver,
  cleanSearchTitle,
  detectVideoQualityTier,
  extractSignificantTokens,
  extractTitleTokens,
  extractSequelInfo,
  extractYear,
  extractEpisodeInfo,
  extractSeasonInfo,
  isJunkMedia,
  calculateTitleCoverage,
  validateTitleBoundaries,
  buildSearchQueries,
} from './base.js';

// Search files directly from PencariMovie public search API
export async function searchPencariApi(query) {
  try {
    const encoded = encodeURIComponent(query);
    const url = `https://unofficialsbot.pencarimovie.com/wp-admin/admin-ajax.php?action=stream_search_files&search=${encoded}`;
    const res = await axios.get(url, {
      timeout: 20000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });
    if (res.data && res.data.success && Array.isArray(res.data.data?.files)) {
      return res.data.data.files;
    }
  } catch (err) {
    console.warn(`[PENCURI API] Search API warning for "${query}":`, err.message);
  }
  return [];
}

// Extract bot parameters from PencariMovie link page
async function fetchPencariLinkDetails(linkUrl) {
  try {
    const res = await axios.get(linkUrl, {
      timeout: 15000,
      maxRedirects: 5,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });
    const html = res.data || '';

    // Extract bot username and start param (e.g. https://t.me/UnOfficialsBot?start=WLLs8k-8665550029-0)
    const botLinkMatch = html.match(/https:\/\/t\.me\/([a-zA-Z0-9_]+)\?start=([a-zA-Z0-9_-]+)/i) ||
                         html.match(/https:\/\/t\.me\/([a-zA-Z0-9_]+)\?startapp=([a-zA-Z0-9_-]+)/i);

    const nonceMatch = html.match(/wp_nonce["']?\s*:\s*["']([^"']+)["']/i) ||
                       html.match(/formData\.append\('wp_nonce',\s*["']([^"']+)["']\)/i);

    const botIdMatch = html.match(/bot_id["']?\s*:\s*["']?(\d+)["']?/i);

    return {
      botUsername: botLinkMatch ? botLinkMatch[1] : 'UnOfficialsBot',
      startParam: botLinkMatch ? botLinkMatch[2] : null,
      nonce: nonceMatch ? nonceMatch[1] : null,
      botId: botIdMatch ? botIdMatch[1] : '8665550029',
    };
  } catch (err) {
    console.warn(`[PENCURI LINK] Warning fetching link details (${linkUrl}):`, err.message);
    return null;
  }
}

// Complete Mini App delivery flow: RequestMainWebView -> telegram_login -> save_write_access -> sendtgfile
async function triggerMiniAppDelivery(client, { deliveryBot, shortCode, miniAppBot, startParam, checkAborted }) {
  try {
    const finalMiniAppBot = miniAppBot || deliveryBot || 'UnOfficialsBot';
    const finalStartParam = startParam || `${shortCode}-8665550029`;

    console.log(`[PENCURI MINI-APP] Preparing Mini App delivery via @${finalMiniAppBot} (param: "${finalStartParam}")...`);

    // Ensure bot is unblocked and started
    try {
      await client.invoke(new Api.contacts.Unblock({ id: finalMiniAppBot }));
    } catch (_) {}
    try {
      await client.sendMessage(finalMiniAppBot, { message: '/start' });
    } catch (_) {}

    const botEntity = await client.getInputEntity(finalMiniAppBot);

    // 1. Invoke RequestMainWebView to obtain tgWebAppData
    const webViewRes = await client.invoke(new Api.messages.RequestMainWebView({
      peer: new Api.InputPeerSelf(),
      bot: botEntity,
      startParam: finalStartParam,
      platform: 'android',
    }));

    if (!webViewRes || !webViewRes.url) {
      console.warn(`[PENCURI MINI-APP] RequestMainWebView did not return URL`);
      return false;
    }

    const urlObj = new URL(webViewRes.url);
    const domain = urlObj.origin;
    const hashPart = urlObj.hash.slice(1);
    const hashParams = new URLSearchParams(hashPart);
    const tgWebAppData = hashParams.get('tgWebAppData') || '';

    if (!tgWebAppData) {
      console.warn(`[PENCURI MINI-APP] No tgWebAppData found in WebApp URL`);
      return false;
    }

    if (checkAborted && checkAborted()) return false;

    // 2. Fetch /webapp HTML to extract redirectUrl and actualBotId
    const webappRes = await fetch(`${domain}/webapp?tgWebAppStartParam=${finalStartParam}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36' },
    });
    const webappHtml = await webappRes.text();
    const rawRedirectMatch = webappHtml.match(/var\s+redirectUrl\s*=\s*["']([^"']+)["']/i);
    const redirectUrl = rawRedirectMatch ? JSON.parse(`"${rawRedirectMatch[1]}"`) : '';

    const botIdMatch = webappHtml.match(/botIdParam\s*=\s*["']?(\d+)["']?/i) ||
                       webappHtml.match(/bot_id["']?\s*:\s*["']?(\d+)["']?/i);
    const actualBotId = botIdMatch ? botIdMatch[1] : '8652691150';

    if (checkAborted && checkAborted()) return false;

    // 3. Perform telegram_login
    const loginFd = new URLSearchParams({
      action: 'telegram_login',
      initData: tgWebAppData,
      bot_id: actualBotId,
      redirect_to: redirectUrl,
      version: '8.0',
      platform: 'android',
    });

    const loginRes = await fetch(`${domain}/wp-admin/admin-ajax.php`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36',
      },
      body: loginFd.toString(),
    });

    const loginData = await loginRes.json().catch(() => null);
    if (!loginData || !loginData.success) {
      console.warn(`[PENCURI MINI-APP] telegram_login failed:`, loginData?.data || 'Unknown error');
      return false;
    }

    let rawCookies = '';
    if (typeof loginRes.headers.getSetCookie === 'function') {
      rawCookies = loginRes.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
    } else {
      rawCookies = loginRes.headers.get('set-cookie') || '';
    }
    const userId = loginData.data?.user_id || '';

    // 4. Call save_write_access
    await fetch(`${domain}/wp-admin/admin-ajax.php`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36',
        'Cookie': rawCookies,
      },
      body: new URLSearchParams({
        action: 'save_write_access',
        bot_id: actualBotId,
        user_id: String(userId),
        granted: '1',
      }).toString(),
    }).catch(() => {});

    if (checkAborted && checkAborted()) return false;

    // 5. Fetch link page with cookies to obtain fresh wp_nonce
    const linkFullUrl = `${domain}${redirectUrl}`;
    const pageRes = await fetch(linkFullUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36',
        'Cookie': rawCookies,
      },
    });
    const pageHtml = await pageRes.text();

    const nonceMatch = pageHtml.match(/formData\.append\('wp_nonce',\s*["']([^"']+)["']\)/i) ||
                       pageHtml.match(/wp_nonce["']?\s*:\s*["']([^"']+)["']/i) ||
                       pageHtml.match(/nonce["']?\s*:\s*["']([a-f0-9]{10})["']/i);
    const nonce = nonceMatch ? nonceMatch[1] : '686bac635e';

    if (checkAborted && checkAborted()) return false;

    // 6. Trigger sendtgfile
    const sendFd = new URLSearchParams({
      action: 'sendtgfile',
      requestfile: shortCode,
      wp_nonce: nonce,
      ref: 'AJAX-BUTTON',
      bot_id: actualBotId,
    });

    const sendRes = await fetch(`${domain}/wp-admin/admin-ajax.php`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36',
        'Referer': linkFullUrl,
        'Cookie': rawCookies,
      },
      body: sendFd.toString(),
    });

    const sendData = await sendRes.json().catch(() => null);
    console.log(`[PENCURI MINI-APP] sendtgfile response:`, JSON.stringify(sendData));
    return Boolean(sendData && sendData.success);
  } catch (err) {
    console.error(`[PENCURI MINI-APP] Delivery error:`, err.message);
    return false;
  }
}

export class PencuriResolver extends BaseResolver {
  constructor(client, options = {}) {
    super(client, options);
  }

  get id() {
    return 'pencuri';
  }

  get name() {
    return 'Pencuri Movie Bot';
  }

  get defaultBot() {
    return 'Pencuri_Movie_Bot';
  }

  async resolve(params, context = {}) {
    const {
      title,
      year,
      season,
      episode,
      totalSeasons: totalSeasonsQuery,
      altTitle: altTitleQuery,
      englishTitle,
      targetQuality = 720,
      requestedTier = '720p',
      effectiveMinTv = 80,
      effectiveMinMovie = 180,
      targetBot = (this.options.targetBot || this.defaultBot).replace(/^@/, ''),
      checkAborted = () => false,
    } = params;

    const altTitle = String(altTitleQuery || englishTitle || '').trim();
    const sNum = season ? parseInt(season, 10) : NaN;
    const eNum = episode ? parseInt(episode, 10) : NaN;
    const isTv = !isNaN(sNum) && !isNaN(eNum);

    const titleTokens = extractTitleTokens(title);
    const significantTokens = extractSignificantTokens(title);
    const targetSequel = extractSequelInfo(title);
    const explicitTargetYear = parseInt(year, 10);
    const targetYear = !isNaN(explicitTargetYear) ? explicitTargetYear : extractYear(title, significantTokens);

    // 1. Check recent chat messages in both targetBot and UnOfficialsBot
    const botsToCheck = [targetBot, 'UnOfficialsBot'];
    const matchingRecentDocs = [];

    for (const bName of botsToCheck) {
      try {
        const recentMsgs = await this.client.getMessages(bName, { limit: 25 });
        for (const msg of recentMsgs) {
          if (msg.media?.document) {
            const doc = msg.media.document;
            const fnAttr = doc.attributes?.find(a => a.className === 'DocumentAttributeFilename');
            const filename = fnAttr ? fnAttr.fileName : msg.message;
            const normFn = (filename || '').toLowerCase();

            if (isJunkMedia(filename, title, altTitle) || isJunkMedia(msg.message, title, altTitle)) continue;

            const docSizeMB = Number(doc.size || 0) / (1024 * 1024);
            if (isTv ? docSizeMB < effectiveMinTv : docSizeMB < effectiveMinMovie) continue;

            const coverage = calculateTitleCoverage(significantTokens, filename);
            if (significantTokens.length <= 2 ? coverage < 1.0 : coverage < 0.70) continue;

            const checkBoundary = validateTitleBoundaries(normFn, title);
            if (checkBoundary.matched && !checkBoundary.ok) {
              if (!altTitle || !validateTitleBoundaries(normFn, altTitle).ok) continue;
            }

            let matches = true;
            if (isTv) {
              const epInfo = extractEpisodeInfo(filename);
              if (!epInfo || (epInfo.isRange ? (eNum < epInfo.start || eNum > epInfo.end) : epInfo.episode !== eNum)) {
                matches = false;
              }
              if (matches) {
                const seasonFound = extractSeasonInfo(filename);
                if (seasonFound !== null && seasonFound !== sNum) matches = false;
              }
            } else {
              const isTvDoc = /\b(s\d{1,2}e\d{1,2}|season\s*\d+|musim\s*\d+|episode\s*\d+|episod\s*\d+|ep\s*\d+)\b/i.test(filename);
              if (isTvDoc) matches = false;

              const docSequel = extractSequelInfo(filename);
              if (targetSequel ? docSequel !== targetSequel : Boolean(docSequel)) matches = false;
            }

            if (matches) {
              const tier = detectVideoQualityTier(filename, '', doc);
              let qualityScore = 10;
              if (targetQuality <= 480) {
                if (tier === 'sd') qualityScore = 60;
                else if (tier === '720p') qualityScore = 30;
                else if (tier === '1080p') qualityScore = 5;
              } else if (targetQuality <= 720) {
                if (tier === '720p') qualityScore = 50;
                else if (tier === 'sd') qualityScore = 30;
                else if (tier === '1080p') qualityScore = 5;
              } else if (targetQuality >= 2160) {
                if (tier === '4k') qualityScore = 70;
                else if (tier === '1080p') qualityScore = 40;
                else if (tier === '720p') qualityScore = 20;
              } else {
                if (tier === '1080p') qualityScore = 50;
                else if (tier === '720p') qualityScore = 30;
              }
              if (normFn.includes('.mp4') || normFn.includes('mp4')) qualityScore += 15;

              matchingRecentDocs.push({ doc, filename, msgId: msg.id, tier, bot: bName, qualityScore });
            }
          }
        }
      } catch (err) {
        console.warn(`[PENCURI CHAT] Error checking messages for @${bName}:`, err.message);
      }
    }

    if (matchingRecentDocs.length > 0) {
      matchingRecentDocs.sort((a, b) => b.qualityScore - a.qualityScore);
      const chosen = matchingRecentDocs[0];
      let isTargetQualityMet = false;
      if (targetQuality >= 2160) {
        isTargetQualityMet = chosen.tier === '4k';
      } else if (targetQuality >= 1080) {
        isTargetQualityMet = chosen.tier === '1080p' || chosen.tier === '4k';
      } else if (targetQuality <= 480) {
        isTargetQualityMet = chosen.tier === 'sd';
      } else {
        isTargetQualityMet = chosen.tier === '720p';
      }

      if (isTargetQualityMet && chosen.qualityScore >= 30) {
        console.log(`[PENCURI RESOLVE] Found matching recent document in @${chosen.bot}: ${chosen.filename} (${chosen.tier})`);
        return {
          document: chosen.doc,
          filename: chosen.filename,
          msgId: chosen.msgId,
          tier: chosen.tier,
        };
      }
    }

    // 2. Prepare prioritized search queries (unified across resolvers)
    const uniqueSearchQueries = buildSearchQueries(params);

    // 3. Query search API for candidate files
    const candidateFiles = [];
    const seenFileIds = new Set();

    for (const sq of uniqueSearchQueries) {
      if (checkAborted()) break;
      console.log(`[PENCURI RESOLVE] Querying search API with "${sq}"...`);
      const files = await searchPencariApi(sq);
      if (files && files.length > 0) {
        for (const f of files) {
          if (!seenFileIds.has(f.id)) {
            seenFileIds.add(f.id);
            candidateFiles.push(f);
          }
        }
      }

      // Early break ONLY if we already gathered candidate files matching the episode / movie AND matching target quality
      const hasTargetQualityCandidate = candidateFiles.some(f => {
        const fn = f.title || '';
        if (isTv) {
          const epInfo = extractEpisodeInfo(fn);
          if (!epInfo || (epInfo.isRange ? (eNum < epInfo.start || eNum > epInfo.end) : epInfo.episode !== eNum)) return false;
          const seasonFound = extractSeasonInfo(fn);
          if (seasonFound !== null && seasonFound !== sNum) return false;
        } else {
          const isTvDoc = /\b(s\d{1,2}e\d{1,2}|season\s*\d+|musim\s*\d+|episode\s*\d+|episod\s*\d+|ep\s*\d+)\b/i.test(fn);
          if (isTvDoc) return false;
          const docSequel = extractSequelInfo(fn);
          if (targetSequel ? docSequel !== targetSequel : Boolean(docSequel)) return false;
        }
        const tier = detectVideoQualityTier(fn, '', null, f.file_size);
        if (targetQuality >= 2160) return tier === '4k';
        if (targetQuality >= 1080) return tier === '1080p' || tier === '4k';
        if (targetQuality <= 480) return tier === 'sd';
        return tier === '720p';
      });

      if (hasTargetQualityCandidate) {
        console.log(`[PENCURI RESOLVE] Found matching target-quality candidate (${requestedTier}) from query "${sq}", proceeding to scoring.`);
        break;
      }
    }

    // 4. Score API candidates
    const validCandidates = [];
    for (const f of candidateFiles) {
      const fn = f.title || '';
      if (isJunkMedia(fn, title, altTitle)) continue;

      const sizeMB = Number(f.file_size || 0) / (1024 * 1024);
      if (isTv ? sizeMB < effectiveMinTv : sizeMB < effectiveMinMovie) continue;

      const coverage = calculateTitleCoverage(significantTokens, fn);
      if (significantTokens.length <= 2 ? coverage < 1.0 : coverage < 0.70) continue;

      let matches = true;
      if (isTv) {
        const epInfo = extractEpisodeInfo(fn);
        if (!epInfo || (epInfo.isRange ? (eNum < epInfo.start || eNum > epInfo.end) : epInfo.episode !== eNum)) {
          matches = false;
        }
        if (matches) {
          const seasonFound = extractSeasonInfo(fn);
          if (seasonFound !== null && seasonFound !== sNum) matches = false;
        }
      } else {
        const isTvDoc = /\b(s\d{1,2}e\d{1,2}|season\s*\d+|musim\s*\d+|episode\s*\d+|episod\s*\d+|ep\s*\d+)\b/i.test(fn);
        if (isTvDoc) matches = false;

        const docSequel = extractSequelInfo(fn);
        if (targetSequel ? docSequel !== targetSequel : Boolean(docSequel)) matches = false;
      }

      if (matches) {
        const tier = detectVideoQualityTier(fn, '', null, f.file_size);
        let score = 50;

        // Quality preference (strictly aligned with base.js / MSM)
        if (targetQuality <= 480) {
          if (tier === 'sd') score += 80;
          else if (tier === '720p') score += 20;
          else if (tier === '1080p') score -= 40;
          else if (tier === '4k') score -= 100;
        } else if (targetQuality <= 720) {
          if (tier === '720p') score += 50;
          else if (tier === 'sd') score += 30;
          else if (tier === '1080p') score += 5;
          else if (tier === '4k') score -= 50;
        } else if (targetQuality >= 2160) {
          if (tier === '4k') score += 100;
          else if (tier === '1080p') score += 60;
          else if (tier === '720p') score += 20;
        } else {
          // 1080p target
          if (tier === '1080p') score += 80;
          else if (tier === '720p') score += 30;
          else if (tier === '4k') score -= 30;
        }

        if (fn.toLowerCase().includes('.mp4')) score += 15;
        if (fn.toLowerCase().includes('malaysub') || fn.toLowerCase().includes('msm')) score += 5;

        validCandidates.push({
          file: f,
          score,
          tier,
        });
      }
    }

    validCandidates.sort((a, b) => b.score - a.score);

    // 5. Try triggering delivery for the best candidates
    for (const cand of validCandidates) {
      if (checkAborted()) break;
      const file = cand.file;
      console.log(`[PENCURI RESOLVE] Selected candidate "${file.title}" (tier: ${cand.tier}, score: ${cand.score}, shortcode: ${file.short_code})`);

      const linkDetails = await fetchPencariLinkDetails(file.play_url || `https://unofficialsbot.pencarimovie.com/link/${file.short_code}`);
      const deliveryBot = linkDetails?.botUsername || 'UnOfficialsBot';
      const startParam = linkDetails?.startParam || `${file.short_code}-${linkDetails?.botId || '8665550029'}-0`;

      console.log(`[PENCURI RESOLVE] Requesting delivery via @${deliveryBot} (start: "${startParam}")...`);
      let sentMsg = null;
      try {
        sentMsg = await this.client.sendMessage(deliveryBot, { message: `/start ${startParam}` });
      } catch (sendErr) {
        if (sendErr.errorMessage === 'YOU_BLOCKED_USER' || (sendErr.message && sendErr.message.includes('YOU_BLOCKED_USER'))) {
          console.warn(`[PENCURI RESOLVE] Bot @${deliveryBot} is blocked. Auto-unblocking...`);
          try {
            await this.client.invoke(new Api.contacts.Unblock({ id: deliveryBot }));
            sentMsg = await this.client.sendMessage(deliveryBot, { message: `/start ${startParam}` });
          } catch (unblockErr) {
            console.error(`[PENCURI RESOLVE] Failed to unblock @${deliveryBot}:`, unblockErr.message);
          }
        } else {
          console.error(`[PENCURI RESOLVE] Error sending to @${deliveryBot}:`, sendErr.message);
        }
      }

      const sentMsgId = sentMsg ? sentMsg.id : 0;

      // Poll for document delivery or Mini App button in deliveryBot, targetBot, and any detected Mini App bot
      let deliveredDoc = null;
      let deliveredMsgId = null;
      let resolvedFilename = file.title;
      let miniAppTriggered = false;
      let miniAppBotDetected = null;

      for (let attempt = 0; attempt < 12; attempt++) {
        if (checkAborted()) break;
        await new Promise(r => setTimeout(r, 1500));
        if (checkAborted()) break;

        const checkBots = [deliveryBot, targetBot];
        if (miniAppBotDetected && !checkBots.includes(miniAppBotDetected)) {
          checkBots.push(miniAppBotDetected);
        }

        for (const b of checkBots) {
          const incoming = await this.client.getMessages(b, { limit: 5 }).catch(() => []);
          for (const im of incoming) {
            if (im.id > sentMsgId) {
              // 1. Direct document delivery check
              if (im.media?.document && im.media.document.size > 10000000) {
                deliveredDoc = im.media.document;
                deliveredMsgId = im.id;
                const fnAttr = deliveredDoc.attributes?.find(a => a.className === 'DocumentAttributeFilename');
                if (fnAttr) resolvedFilename = fnAttr.fileName;
                break;
              }

              // 2. Mini App button detection (e.g. t.me/freemovie69bot?startapp=...)
              if (!miniAppTriggered && im.replyMarkup?.rows) {
                for (const row of im.replyMarkup.rows) {
                  for (const btn of row.buttons) {
                    if (btn.url && (btn.url.includes('startapp=') || btn.url.includes('/link/'))) {
                      const matchApp = btn.url.match(/t\.me\/([a-zA-Z0-9_]+)\?startapp=([a-zA-Z0-9_-]+)/i);
                      const targetMiniAppBot = matchApp ? matchApp[1] : deliveryBot;
                      const targetStartParam = matchApp ? matchApp[2] : startParam;
                      miniAppBotDetected = targetMiniAppBot;
                      miniAppTriggered = true;
                      console.log(`[PENCURI RESOLVE] Detected Mini App button for @${targetMiniAppBot} (param: "${targetStartParam}"). Triggering delivery flow...`);
                      await triggerMiniAppDelivery(this.client, {
                        deliveryBot,
                        shortCode: file.short_code,
                        miniAppBot: targetMiniAppBot,
                        startParam: targetStartParam,
                        checkAborted,
                      });
                      break;
                    }
                  }
                  if (miniAppTriggered) break;
                }
              }
            }
          }
          if (deliveredDoc) break;
        }
        if (deliveredDoc) break;
      }

      if (deliveredDoc) {
        console.log(`[PENCURI RESOLVE] Received delivered document for "${resolvedFilename}"!`);
        const actualTier = detectVideoQualityTier(resolvedFilename, '', deliveredDoc, deliveredDoc.size);
        return {
          document: deliveredDoc,
          msgId: deliveredMsgId,
          filename: resolvedFilename,
          tier: actualTier,
        };
      }
    }

    return null;
  }
}
