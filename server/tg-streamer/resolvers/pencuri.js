/**
 * Pencuri Resolver - Telegram Stream Resolver for @Pencuri_Movie_Bot & @UnOfficialsBot
 * Module: server/tg-streamer/resolvers/pencuri.js
 */

import { Api } from 'telegram';
import https from 'https';
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
  scoreCandidateWithReason,
} from './base.js';

// Singleton HTTPS Agent with bounded keepalive pooling for zero memory leaks (#252)
const pencuriHttpsAgent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 15000,
  maxSockets: 10,
  maxFreeSockets: 5,
  timeout: 30000,
});

export const pencuriHttp = axios.create({
  httpsAgent: pencuriHttpsAgent,
  timeout: 15000,
});

// Search files directly from PencariMovie public search API
export async function searchPencariApi(query) {
  try {
    const encoded = encodeURIComponent(query);
    const url = `https://unofficialsbot.pencarimovie.com/wp-admin/admin-ajax.php?action=stream_search_files&search=${encoded}`;
    const res = await pencuriHttp.get(url, {
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
export async function fetchPencariLinkDetails(linkUrl) {
  try {
    const res = await pencuriHttp.get(linkUrl, {
      timeout: 5000,
      maxRedirects: 5,
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
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
    const isMiniApp = html.includes('sendtgfile') || !botLinkMatch;

    return {
      botUsername: botLinkMatch ? botLinkMatch[1] : (isMiniApp ? 'guestmodebot' : 'UnOfficialsBot'),
      startParam: botLinkMatch ? botLinkMatch[2] : null,
      nonce: nonceMatch ? nonceMatch[1] : null,
      botId: botIdMatch ? botIdMatch[1] : '8788369318',
      isMiniApp,
      notFound: false,
    };
  } catch (err) {
    const is404 = err.response?.status === 404 || (err.message && err.message.includes('404'));
    if (is404) {
      console.warn(`[PENCURI LINK] Link returned 404 Not Found (${linkUrl}). Candidate file is dead/deleted.`);
      return { notFound: true, isMiniApp: false };
    }
    console.warn(`[PENCURI LINK] Warning fetching link details (${linkUrl}):`, err.message);
    return null;
  }
}

// Complete Mini App delivery flow: RequestMainWebView -> telegram_login -> save_write_access -> sendtgfile
export async function triggerMiniAppDelivery(client, { deliveryBot, shortCode, miniAppBot, startParam, checkAborted }) {
  try {
    const finalMiniAppBot = miniAppBot || deliveryBot || 'guestmodebot';
    const finalStartParam = startParam || `${shortCode}-8665550029`;

    console.log(`[PENCURI MINI-APP] Preparing Mini App delivery via @${finalMiniAppBot} (param: "${finalStartParam}")...`);

    // Ensure bot is unblocked (do NOT send /start as that triggers FSub replies)
    try {
      await client.invoke(new Api.contacts.Unblock({ id: finalMiniAppBot }));
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

    // 2. Fetch /webapp HTML to extract redirectUrl and actualBotId (using text/html Accept header to avoid WordPress 404)
    let redirectUrl = `/link/${shortCode}`;
    const defaultBotId = finalMiniAppBot.toLowerCase().includes('guest') ? '8788369318' : '8665550029';
    let actualBotId = defaultBotId;

    try {
      const webappRes = await pencuriHttp.get(`${domain}/webapp?tgWebAppStartParam=${finalStartParam}`, {
        headers: {
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36',
        },
        timeout: 15000,
      });
      const webappHtml = webappRes.data || '';
      const rawRedirectMatch = webappHtml.match(/var\s+redirectUrl\s*=\s*["']([^"']+)["']/i);
      if (rawRedirectMatch) redirectUrl = JSON.parse(`"${rawRedirectMatch[1]}"`);

      const botIdMatch = webappHtml.match(/botIdParam\s*=\s*["']?(\d+)["']?/i);
      if (botIdMatch) actualBotId = botIdMatch[1];
    } catch (webappErr) {
      console.warn(`[PENCURI MINI-APP] /webapp fetch note: ${webappErr.message}`);
    }

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

    const loginRes = await pencuriHttp.post(`${domain}/wp-admin/admin-ajax.php`, loginFd.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36',
      },
      timeout: 15000,
    });

    const loginData = loginRes.data;
    if (!loginData || !loginData.success) {
      console.warn(`[PENCURI MINI-APP] telegram_login failed:`, loginData?.data || 'Unknown error');
      return false;
    }

    const rawCookies = loginRes.headers['set-cookie'] || [];
    const cookies = rawCookies.map(c => c.split(';')[0]).join('; ');
    const userId = loginData.data?.user_id || '';
    if (loginData.data?.redirect) redirectUrl = loginData.data.redirect;

    // 4. Call save_write_access
    await pencuriHttp.post(`${domain}/wp-admin/admin-ajax.php`, new URLSearchParams({
      action: 'save_write_access',
      bot_id: actualBotId,
      user_id: String(userId),
      granted: '1',
    }).toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36',
        'Cookie': cookies,
      },
      timeout: 10000,
    }).catch(() => {});

    if (checkAborted && checkAborted()) return false;

    // 5. Fetch link page with cookies to obtain fresh wp_nonce
    const linkFullUrl = `${domain}${redirectUrl}`;
    let nonce = '686bac635e';
    try {
      const pageRes = await pencuriHttp.get(linkFullUrl, {
        headers: {
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36',
          'Cookie': cookies,
        },
        timeout: 15000,
      });
      const pageHtml = pageRes.data || '';
      const nonceMatch = pageHtml.match(/formData\.append\('wp_nonce',\s*["']([^"']+)["']\)/i) ||
                         pageHtml.match(/wp_nonce["']?\s*:\s*["']([^"']+)["']/i) ||
                         pageHtml.match(/nonce["']?\s*:\s*["']([a-f0-9]{10})["']/i);
      if (nonceMatch) nonce = nonceMatch[1];
    } catch (pageErr) {
      console.warn(`[PENCURI MINI-APP] Link page fetch note: ${pageErr.message}`);
    }

    if (checkAborted && checkAborted()) return false;

    // 6. Trigger sendtgfile
    const sendFd = new URLSearchParams({
      action: 'sendtgfile',
      requestfile: shortCode,
      wp_nonce: nonce,
      ref: 'AJAX-BUTTON',
      bot_id: actualBotId,
    });

    const sendRes = await pencuriHttp.post(`${domain}/wp-admin/admin-ajax.php`, sendFd.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36',
        'Referer': linkFullUrl,
        'Cookie': cookies,
      },
      timeout: 15000,
    });

    const sendData = sendRes.data;
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

    const evalContext = {
      isTv,
      title,
      altTitle,
      year: explicitTargetYear || targetYear,
      sNum,
      eNum,
      totalSeasons: totalSeasonsQuery ? parseInt(totalSeasonsQuery, 10) : 1,
      targetQuality,
      significantTokens,
      altSignificantTokens: altTitle ? extractSignificantTokens(altTitle) : [],
      minTvSizeMb: effectiveMinTv,
      minMovieSizeMb: effectiveMinMovie,
    };

    // 1. Check recent chat messages in both targetBot and UnOfficialsBot concurrently (#252)
    const botsToCheck = [targetBot, 'UnOfficialsBot'];
    const matchingRecentDocs = [];

    const recentResults = await Promise.allSettled(
      botsToCheck.map(bName => this.client.getMessages(bName, { limit: 25 }))
    );

    for (let i = 0; i < botsToCheck.length; i++) {
      const bName = botsToCheck[i];
      const res = recentResults[i];
      if (res.status === 'fulfilled' && Array.isArray(res.value)) {
        for (const msg of res.value) {
          if (msg.media?.document) {
            const doc = msg.media.document;
            const fnAttr = doc.attributes?.find(a => a.className === 'DocumentAttributeFilename');
            const filename = fnAttr ? fnAttr.fileName : msg.message;
            const docSizeMB = Number(doc.size || 0) / (1024 * 1024);

            const evalRes = scoreCandidateWithReason({
              text: filename,
              contextText: msg.message,
              sizeMB: docSizeMB,
            }, evalContext);

            if (evalRes.score > 0) {
              matchingRecentDocs.push({
                doc,
                filename,
                msgId: msg.id,
                tier: evalRes.tier,
                bot: bName,
                qualityScore: evalRes.score,
              });
            }
          }
        }
      } else if (res.status === 'rejected') {
        console.warn(`[PENCURI CHAT] Error checking messages for @${bName}:`, res.reason?.message);
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

      if (isTargetQualityMet && chosen.qualityScore >= 150) {
        console.log(`[PENCURI RESOLVE] Found matching recent document in @${chosen.bot}: ${chosen.filename} (${chosen.tier}, score: ${chosen.qualityScore})`);
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

    // 3. Query search API for candidate files in concurrent batches (#252)
    const candidateFiles = [];
    const seenFileIds = new Set();
    const BATCH_SIZE = 3;

    for (let i = 0; i < uniqueSearchQueries.length; i += BATCH_SIZE) {
      if (checkAborted()) break;
      const batch = uniqueSearchQueries.slice(i, i + BATCH_SIZE);
      console.log(`[PENCURI RESOLVE] Querying search API with batch [${batch.map(q => `"${q}"`).join(', ')}]...`);

      const batchResults = await Promise.all(
        batch.map(sq => searchPencariApi(sq).catch(err => {
          console.warn(`[PENCURI API] Batch item error for "${sq}":`, err.message);
          return [];
        }))
      );

      for (let j = 0; j < batch.length; j++) {
        const sq = batch[j];
        const files = batchResults[j];
        console.log(`[PENCURI API] Received ${files ? files.length : 0} file(s) for query "${sq}"`);
        if (files && files.length > 0) {
          for (const f of files) {
            if (!seenFileIds.has(f.id)) {
              seenFileIds.add(f.id);
              candidateFiles.push(f);
            }
          }
        }
      }

      // Early break ONLY if we already gathered candidate files with a high score (>= 150) AND matching target quality
      const hasTargetQualityCandidate = candidateFiles.some(f => {
        const fn = f.title || '';
        const sizeMB = Number(f.file_size || 0) / (1024 * 1024);
        const evalRes = scoreCandidateWithReason({ text: fn, sizeMB }, evalContext);
        if (evalRes.score < 150) return false;
        if (targetQuality >= 2160) return evalRes.tier === '4k';
        if (targetQuality >= 1080) return evalRes.tier === '1080p' || evalRes.tier === '4k';
        if (targetQuality <= 480) return evalRes.tier === 'sd';
        return evalRes.tier === '720p';
      });

      if (hasTargetQualityCandidate) {
        console.log(`[PENCURI RESOLVE] Found matching target-quality candidate (${requestedTier}) from batch, proceeding to scoring.`);
        break;
      }
    }

    // 4. Score API candidates using shared agnostic scoring
    const validCandidates = [];
    for (const f of candidateFiles) {
      const fn = f.title || '';
      const sizeMB = Number(f.file_size || 0) / (1024 * 1024);
      const evalRes = scoreCandidateWithReason({ text: fn, sizeMB }, evalContext);

      console.log(`[PENCURI SCORE] Candidate: "${fn}" (${sizeMB.toFixed(1)} MB) | Tier: ${evalRes.tier} | Score: ${evalRes.score} | Decision: ${evalRes.reason}`);

      if (evalRes.score > 0) {
        validCandidates.push({
          file: f,
          score: evalRes.score,
          tier: evalRes.tier,
          reason: evalRes.reason,
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

      // Fast-fail dead/404 candidates immediately with 0 delay (#253)
      if (linkDetails?.notFound) {
        console.warn(`[PENCURI RESOLVE] Candidate "${file.title}" (${file.short_code}) returned 404 Not Found on PencariMovie. Skipping dead candidate.`);
        continue;
      }

      const deliveryBot = linkDetails?.botUsername || (linkDetails?.isMiniApp ? 'guestmodebot' : 'UnOfficialsBot');
      const startParam = linkDetails?.startParam || `${file.short_code}-${linkDetails?.botId || '8665550029'}-0`;

      // Pre-capture baseline message IDs concurrently across delivery bots (#252)
      // When candidate uses Mini App / AJAX delivery, scope polling directly to the delivery bot
      const checkBots = linkDetails?.isMiniApp
        ? Array.from(new Set([deliveryBot, 'guestmodebot'].filter(Boolean)))
        : Array.from(new Set([deliveryBot, 'guestmodebot', 'UnOfficialsBot', targetBot].filter(Boolean)));

      const baselineMsgIds = {};
      const baselineResults = await Promise.allSettled(
        checkBots.map(b => this.client.getMessages(b, { limit: 1 }))
      );
      checkBots.forEach((b, idx) => {
        const res = baselineResults[idx];
        baselineMsgIds[b] = (res.status === 'fulfilled' && res.value?.[0]?.id) || 0;
      });

      let miniAppTriggered = false;

      // If link uses direct Mini App delivery, trigger it directly without hitting UnOfficialsBot FSub (#253)
      if (linkDetails?.isMiniApp) {
        console.log(`[PENCURI RESOLVE] Candidate "${file.short_code}" uses Mini App / AJAX delivery. Triggering direct delivery via @${deliveryBot}...`);
        miniAppTriggered = true;
        await triggerMiniAppDelivery(this.client, {
          deliveryBot,
          shortCode: file.short_code,
          miniAppBot: deliveryBot,
          startParam: `${file.short_code}-8665550029`,
          checkAborted,
        });
      } else {
        console.log(`[PENCURI RESOLVE] Requesting delivery via @${deliveryBot} (start: "${startParam}")...`);
        try {
          await this.client.sendMessage(deliveryBot, { message: `/start ${startParam}` });
        } catch (sendErr) {
          if (sendErr.errorMessage === 'YOU_BLOCKED_USER' || (sendErr.message && sendErr.message.includes('YOU_BLOCKED_USER'))) {
            console.warn(`[PENCURI RESOLVE] Bot @${deliveryBot} is blocked. Auto-unblocking...`);
            try {
              await this.client.invoke(new Api.contacts.Unblock({ id: deliveryBot }));
              await this.client.sendMessage(deliveryBot, { message: `/start ${startParam}` });
            } catch (unblockErr) {
              console.error(`[PENCURI RESOLVE] Failed to unblock @${deliveryBot}:`, unblockErr.message);
            }
          } else {
            console.error(`[PENCURI RESOLVE] Error sending to @${deliveryBot}:`, sendErr.message);
          }
        }
      }

      // Poll for document delivery or Mini App button concurrently (#252)
      let deliveredDoc = null;
      let deliveredMsgId = null;
      let deliveredBot = deliveryBot;
      let resolvedFilename = file.title;
      let fsubDetected = false;

      for (let attempt = 0; attempt < 12; attempt++) {
        if (checkAborted()) break;
        // Responsive initial polling: 1000ms for first 3 attempts, 1500ms thereafter
        const delayMs = attempt < 3 ? 1000 : 1500;
        await new Promise(r => setTimeout(r, delayMs));
        if (checkAborted()) break;

        const incomingResults = await Promise.allSettled(
          checkBots.map(b => this.client.getMessages(b, { limit: 5 }))
        );

        for (let bIdx = 0; bIdx < checkBots.length; bIdx++) {
          const b = checkBots[bIdx];
          const res = incomingResults[bIdx];
          const incoming = (res.status === 'fulfilled' && Array.isArray(res.value)) ? res.value : [];
          const baseId = baselineMsgIds[b] || 0;

          for (const im of incoming) {
            if (im.id > baseId) {
              // 1. Direct document delivery check
              if (im.media?.document && im.media.document.size > 10000000) {
                deliveredDoc = im.media.document;
                deliveredMsgId = im.id;
                deliveredBot = b;
                const fnAttr = deliveredDoc.attributes?.find(a => a.className === 'DocumentAttributeFilename');
                if (fnAttr) resolvedFilename = fnAttr.fileName;
                break;
              }

              // 2. Force-Subscription (FSub) gate detection (#253)
              const isFSub = im.message && /sertai saluran|saluran tajaan|join channel|sila sertai/i.test(im.message);
              if (isFSub && !fsubDetected) {
                fsubDetected = true;
                if (!miniAppTriggered) {
                  console.warn(`[PENCURI RESOLVE] Detected Force-Subscription gate on @${b}. Bypassing via @guestmodebot Mini App...`);
                  miniAppTriggered = true;
                  await triggerMiniAppDelivery(this.client, {
                    deliveryBot: 'guestmodebot',
                    shortCode: file.short_code,
                    miniAppBot: 'guestmodebot',
                    startParam: `${file.short_code}-8665550029`,
                    checkAborted,
                  });
                  break;
                } else {
                  console.warn(`[PENCURI RESOLVE] FSub gate persisted on candidate "${file.short_code}". Skipping candidate.`);
                  break;
                }
              }

              // 3. Mini App button detection (e.g. t.me/guestmodebot?startapp=... or t.me/freemovie69bot?startapp=...)
              if (!miniAppTriggered && im.replyMarkup?.rows) {
                for (const row of im.replyMarkup.rows) {
                  for (const btn of row.buttons) {
                    if (btn.url && (btn.url.includes('startapp=') || btn.url.includes('/link/'))) {
                      const matchApp = btn.url.match(/t\.me\/([a-zA-Z0-9_]+)\?startapp=([a-zA-Z0-9_-]+)/i);
                      const targetMiniAppBot = matchApp ? matchApp[1] : deliveryBot;
                      const targetStartParam = matchApp ? matchApp[2] : startParam;
                      if (!checkBots.includes(targetMiniAppBot)) {
                        checkBots.push(targetMiniAppBot);
                        baselineMsgIds[targetMiniAppBot] = im.id;
                      }
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
        if (fsubDetected && miniAppTriggered && attempt >= 5) {
          console.warn(`[PENCURI RESOLVE] Candidate "${file.short_code}" delivery wait exceeded after Mini App trigger. Trying next candidate.`);
          break;
        }
      }

      if (deliveredDoc) {
        console.log(`[PENCURI RESOLVE] Received delivered document for "${resolvedFilename}" via @${deliveredBot}!`);
        const actualTier = detectVideoQualityTier(resolvedFilename, '', deliveredDoc, deliveredDoc.size);
        return {
          document: deliveredDoc,
          msgId: deliveredMsgId,
          filename: resolvedFilename,
          tier: actualTier,
          bot: deliveredBot,
        };
      }
    }

    return null;
  }
}
