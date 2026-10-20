/**
 * MSM Resolver - Telegram Bot Stream Resolver for @msm34bot
 * Module: server/tg-streamer/resolvers/msm.js
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
  generateSeriesSearchQueries,
  buildSearchQueries,
  scoreCandidateButtonWithReason,
} from './base.js';

// Ad-Gate HTTP handshake with automatic retry for transient Cloudflare / network timeouts
async function axiosWithRetry(fn, desc, maxRetries = 2, delayMs = 1000) {
  let lastErr;
  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const isNetworkOrTimeout = err.code === 'ECONNABORTED' ||
                                 err.code === 'ETIMEDOUT' ||
                                 err.code === 'ECONNRESET' ||
                                 err.code === 'EAI_AGAIN' ||
                                 err.code === 'ENOTFOUND' ||
                                 (err.response && err.response.status >= 500);
      if (attempt <= maxRetries && isNetworkOrTimeout) {
        console.warn(`[RESOLVE RETRY] ${desc} attempt ${attempt} failed (${err.code || err.message}). Retrying in ${delayMs}ms...`);
        await new Promise(r => setTimeout(r, delayMs));
        delayMs = Math.round(delayMs * 1.5);
      } else {
        throw err;
      }
    }
  }
  throw lastErr;
}

// Find pagination "Next" button in replyMarkup
function findNextPageButton(replyMarkup) {
  if (!replyMarkup?.rows) return null;
  for (const row of replyMarkup.rows) {
    for (const btn of row.buttons) {
      if (btn.className === 'KeyboardButtonCallback' && btn.data) {
        const txt = (btn.text || '').toLowerCase();
        if (
          txt.includes('next') ||
          txt.includes('➡️') ||
          txt.includes('➡') ||
          txt.includes('seterusnya') ||
          txt.includes('>>') ||
          txt.includes('>') ||
          /page\s*\d+/i.test(txt)
        ) {
          return btn;
        }
      }
    }
  }
  return null;
}

// Find pagination button to navigate towards targetPage
function findPageButton(replyMarkup, targetPage, currentPage) {
  if (!replyMarkup?.rows) return null;

  // 1. Direct number button match (e.g. "1", "2", "3", or "【1】")
  for (const row of replyMarkup.rows) {
    for (const btn of row.buttons) {
      if (btn.className === 'KeyboardButtonCallback' && btn.data) {
        const txt = (btn.text || '').trim();
        if (txt === String(targetPage) || txt === `【${targetPage}】`) {
          return btn;
        }
      }
    }
  }

  // 2. Direct first-page button if targeting page 1
  if (targetPage === 1) {
    for (const row of replyMarkup.rows) {
      for (const btn of row.buttons) {
        if (btn.className === 'KeyboardButtonCallback' && btn.data) {
          const txt = (btn.text || '').trim();
          if (txt === '⏮️' || txt === '1' || txt === '<<') {
            return btn;
          }
        }
      }
    }
  }

  // 3. Relative arrow navigation: Previous (⬅️) or Next (➡️)
  for (const row of replyMarkup.rows) {
    for (const btn of row.buttons) {
      if (btn.className === 'KeyboardButtonCallback' && btn.data) {
        const txt = (btn.text || '').toLowerCase().trim();
        if (targetPage < currentPage && (txt.includes('⬅️') || txt.includes('⬅') || txt.includes('prev') || txt.includes('kembali'))) {
          return btn;
        }
        if (targetPage > currentPage && (txt.includes('➡️') || txt.includes('➡') || txt.includes('next') || txt.includes('seterusnya'))) {
          return btn;
        }
      }
    }
  }

  return null;
}

// Navigate message in-place to targetPage via bot callback answer
async function navigateToPage(client, targetBot, msgId, targetPage, currentMsg, currentMsgPage, checkAborted = () => false) {
  let activeMsg = currentMsg;
  let activePage = currentMsgPage;
  let steps = 0;
  const MAX_STEPS = 6;

  while (activeMsg && activePage !== targetPage && steps < MAX_STEPS) {
    if (checkAborted()) break;
    steps++;
    const navBtn = findPageButton(activeMsg.replyMarkup, targetPage, activePage);
    if (!navBtn) {
      console.warn(`[MSM RESOLVE] No navigation callback button found to reach page ${targetPage} from page ${activePage}`);
      break;
    }

    console.log(`[MSM RESOLVE] Navigating message ${msgId} from page ${activePage} towards page ${targetPage} via callback ("${navBtn.text}")...`);
    try {
      await client.invoke(new Api.messages.GetBotCallbackAnswer({
        peer: targetBot,
        msgId: msgId,
        data: navBtn.data,
      }));
      await new Promise(r => setTimeout(r, 1200));
      const refreshed = await client.getMessages(targetBot, { ids: [msgId] });
      if (refreshed && refreshed[0]) {
        activeMsg = refreshed[0];
        const btnText = (navBtn.text || '').trim();
        if (btnText === String(targetPage) || (targetPage === 1 && (btnText === '⏮️' || btnText === '1'))) {
          activePage = targetPage;
        } else if (btnText.includes('⬅️') || btnText.includes('⬅')) {
          activePage = Math.max(1, activePage - 1);
        } else if (btnText.includes('➡️') || btnText.includes('➡')) {
          activePage = activePage + 1;
        }
      } else {
        break;
      }
    } catch (err) {
      console.warn(`[MSM RESOLVE] Navigation callback error on page ${activePage}:`, err.message);
      break;
    }
  }

  return { msg: activeMsg, page: activePage };
}

export class MsmResolver extends BaseResolver {
  constructor(client, options = {}) {
    super(client, options);
    this.deadShortcodes = options.deadShortcodes || new Set();
  }

  get id() {
    return 'msm';
  }

  get name() {
    return 'MSM Bot';
  }

  get defaultBot() {
    return 'msm34bot';
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
      effectiveMaxPages = 3,
      targetBot = (this.options.targetBot || this.defaultBot).replace(/^@/, ''),
      checkAborted = () => false,
      fallbackCached = null,
      db = null,
      baseCacheKey = '',
    } = params;

    const altTitle = String(altTitleQuery || englishTitle || '').trim();
    const sNum = season ? parseInt(season, 10) : NaN;
    const eNum = episode ? parseInt(episode, 10) : NaN;
    const totalSeasons = totalSeasonsQuery ? parseInt(totalSeasonsQuery, 10) : NaN;
    const isTv = !isNaN(sNum) && !isNaN(eNum);
    const sPadded = isTv ? String(sNum).padStart(2, '0') : '';
    const epPadded = isTv ? String(eNum).padStart(2, '0') : '';
    const tvTag = isTv ? `S${sPadded}E${epPadded}` : '';
    const queryTitle = isTv ? `${title} ${tvTag}` : `${title} ${year || ''}`.trim();

    // 1. Search recent and server-side chat messages
    const recentMsgs = await this.client.getMessages(targetBot, { limit: 30 });
    const cleanTitle = cleanSearchTitle(title);
    const candidateMsgs = [...recentMsgs];

    try {
      const serverDocs = await this.client.getMessages(targetBot, {
        search: isTv ? `${cleanTitle} ${epPadded}` : cleanTitle,
        limit: 20,
        filter: new Api.InputMessagesFilterDocument(),
      });
      if (serverDocs && serverDocs.length > 0) {
        const seenIds = new Set(candidateMsgs.map(m => m.id));
        for (const sm of serverDocs) {
          if (!seenIds.has(sm.id)) {
            candidateMsgs.push(sm);
            seenIds.add(sm.id);
          }
        }
      }
      if (isTv) {
        const epWordDocs = await this.client.getMessages(targetBot, {
          search: `${cleanTitle} Episod ${eNum}`,
          limit: 15,
          filter: new Api.InputMessagesFilterDocument(),
        }).catch(() => []);
        if (epWordDocs && epWordDocs.length > 0) {
          const seenIds = new Set(candidateMsgs.map(m => m.id));
          for (const sm of epWordDocs) {
            if (!seenIds.has(sm.id)) {
              candidateMsgs.push(sm);
              seenIds.add(sm.id);
            }
          }
        }
      }
    } catch (sErr) {
      console.warn('[MSM SEARCH SERVER] MTProto document search warning:', sErr.message);
    }

    const titleTokens = extractTitleTokens(title);
    const significantTokens = extractSignificantTokens(title);
    const targetSequel = extractSequelInfo(title);
    const explicitTargetYear = parseInt(year, 10);
    const targetYear = !isNaN(explicitTargetYear) ? explicitTargetYear : extractYear(title, significantTokens);
    const matchingRecentDocs = [];

    for (const msg of candidateMsgs) {
      if (msg.media?.document) {
        const doc = msg.media.document;
        const fnAttr = doc.attributes?.find(a => a.className === 'DocumentAttributeFilename');
        const filename = fnAttr ? fnAttr.fileName : msg.message;
        const normFn = filename.toLowerCase();

        // Junk media filter
        if (isJunkMedia(filename, title, altTitle) || isJunkMedia(msg.message, title, altTitle)) {
          continue;
        }

        // File size check
        const docSizeMB = Number(doc.size || 0) / (1024 * 1024);
        if (isTv ? docSizeMB < effectiveMinTv : docSizeMB < effectiveMinMovie) {
          continue;
        }

        // Strict title coverage check
        const coverage = calculateTitleCoverage(significantTokens, filename);
        if (significantTokens.length <= 2 ? coverage < 1.0 : coverage < 0.70) {
          continue;
        }

        // Boundary check
        const checkBoundary = validateTitleBoundaries(normFn, title);
        if (checkBoundary.matched && !checkBoundary.ok) {
          if (!altTitle || !validateTitleBoundaries(normFn, altTitle).ok) {
            continue;
          }
        }

        let matchesCandidate = true;

        if (isTv) {
          const epInfo = extractEpisodeInfo(filename);
          if (!epInfo) {
            matchesCandidate = false;
          } else if (epInfo.isRange) {
            if (eNum < epInfo.start || eNum > epInfo.end) {
              matchesCandidate = false;
            }
          } else if (epInfo.episode !== eNum) {
            matchesCandidate = false;
          }

          if (matchesCandidate) {
            const seasonFound = extractSeasonInfo(filename);
            if (seasonFound !== null && seasonFound !== sNum) {
              matchesCandidate = false;
            }
          }

          if (matchesCandidate && targetYear) {
            const docYear = extractYear(filename, significantTokens);
            if (docYear && Math.abs(targetYear - docYear) > 1 && !isNaN(explicitTargetYear)) {
              matchesCandidate = false;
            }
          }
        } else {
          const isTvDoc = /\b(s\d{1,2}e\d{1,2}|s\d{1,2}\s*ep?\s*\d{1,2}|season\s*\d+|musim\s*\d+|episode\s*\d+|episod\s*\d+|ep\s*\d+|\.end\.)\b/i.test(filename) ||
                          /\b(s\d{1,2}e\d{1,2}|s\d{1,2}\s*ep?\s*\d{1,2}|season\s*\d+|musim\s*\d+|episode\s*\d+|episod\s*\d+|ep\s*\d+|\.end\.)\b/i.test(msg.message || '');
          if (isTvDoc) {
            matchesCandidate = false;
          }

          const docSequel = extractSequelInfo(filename);
          if (targetSequel) {
            if (docSequel !== targetSequel) {
              matchesCandidate = false;
            }
          } else {
            if (docSequel) {
              matchesCandidate = false;
            }
          }

          const docYear = extractYear(filename, significantTokens);
          if (targetYear && docYear && Math.abs(targetYear - docYear) > 1 && !isNaN(explicitTargetYear)) {
            matchesCandidate = false;
          }
        }

        if (matchesCandidate) {
          const fnLower = (filename || '').toLowerCase();
          const is4k = fnLower.includes('2160p') || fnLower.includes('4k') || fnLower.includes('uhd');
          const is1080 = fnLower.includes('1080p') || fnLower.includes('1080');
          const is720 = fnLower.includes('720p') || fnLower.includes('720');
          const isLower = fnLower.includes('480p') || fnLower.includes('540p') || fnLower.includes('360p');

          let qualityScore = 10;
          if (targetQuality <= 480) {
            if (isLower) qualityScore = 60;
            else if (is720) qualityScore = 30;
            else if (is1080) qualityScore = 5;
          } else if (targetQuality <= 720) {
            if (is720) qualityScore = 50;
            else if (isLower) qualityScore = 30;
            else if (is1080) qualityScore = 5;
          } else if (targetQuality >= 2160) {
            if (is4k) qualityScore = 70;
            else if (is1080) qualityScore = 40;
            else if (is720) qualityScore = 20;
          } else {
            if (is1080) qualityScore = 50;
            else if (is720) qualityScore = 30;
          }
          if (fnLower.includes('.mp4') || fnLower.includes('mp4')) qualityScore += 15;

          matchingRecentDocs.push({ doc, filename, qualityScore, msgId: msg.id });
        }
      }
    }

    if (matchingRecentDocs.length > 0) {
      matchingRecentDocs.sort((a, b) => b.qualityScore - a.qualityScore);
      const chosen = matchingRecentDocs[0];
      const chosenTier = detectVideoQualityTier(chosen.filename, '', chosen.doc);

      let isTargetQualityMet = false;
      if (targetQuality >= 2160) {
        isTargetQualityMet = chosenTier === '4k';
      } else if (targetQuality >= 1080) {
        isTargetQualityMet = chosenTier === '1080p' || chosenTier === '4k';
      } else if (targetQuality <= 480) {
        isTargetQualityMet = chosenTier === 'sd';
      } else {
        isTargetQualityMet = chosenTier === '720p' || chosenTier === '1080p' || chosenTier === '4k';
      }

      if (isTargetQualityMet && chosen.qualityScore >= 30) {
        console.log(`[MSM RESOLVE] Found matching recent document in chat: ${chosen.filename} (ID: ${chosen.doc.id}, score: ${chosen.qualityScore}, tier: ${chosenTier})`);
        return {
          document: chosen.doc,
          filename: chosen.filename,
          msgId: chosen.msgId,
          tier: chosenTier,
        };
      }
    }

    // 2. Prepare prioritized search queries (unified across resolvers)
    const uniqueSearchQueries = buildSearchQueries(params);
    const cleanT = cleanSearchTitle(title);
    let effectiveAltTitle = altTitle ? cleanSearchTitle(altTitle) : '';
    if (!effectiveAltTitle) {
      if (/\bproject\b/i.test(cleanT)) {
        effectiveAltTitle = cleanT.replace(/\bproject\b/gi, 'Projek');
      } else if (/\bprojek\b/i.test(cleanT)) {
        effectiveAltTitle = cleanT.replace(/\bprojek\b/gi, 'Project');
      }
    }
    const altTokens = effectiveAltTitle ? extractSignificantTokens(effectiveAltTitle) : [];

    let deliveredDoc = null;
    let deliveredMsgId = null;
    let resolvedFilename = null;

    function scoreButton(btn, msg) {
      return scoreCandidateButtonWithReason(btn, msg, {
        isTv,
        title,
        altTitle: effectiveAltTitle,
        year,
        sNum,
        eNum,
        totalSeasons,
        targetQuality,
        significantTokens,
        altSignificantTokens: altTokens,
        minTvSizeMb: effectiveMinTv,
        minMovieSizeMb: effectiveMinMovie,
      });
    }

    for (const sq of uniqueSearchQueries) {
      if (checkAborted()) break;
      console.log(`[MSM RESOLVE] Querying @${targetBot} with: "${sq}"...`);
      const sentMsg = await this.client.sendMessage(targetBot, { message: sq });
      const sentMsgId = sentMsg.id;

      let noResults = false;

      for (let poll = 0; poll < 8; poll++) {
        if (checkAborted()) break;
        await new Promise(r => setTimeout(r, 400));
        const msgs = await this.client.getMessages(targetBot, { limit: 5 });
        const candidates = [];

        let activeBotMsg = null;
        let activeBotPage = 1;

        for (const m of msgs) {
          if (m.id > sentMsgId) {
            const textLower = (m.message || '').toLowerCase();
            if (
              (!m.replyMarkup || !m.replyMarkup.rows || m.replyMarkup.rows.length === 0) &&
              (textLower.includes('tiada carian') || textLower.includes('tidak dijumpai') || textLower.includes('tiada hasil') || textLower.includes('no result'))
            ) {
              console.log(`[MSM RESOLVE] Bot returned no results for "${sq}", advancing immediately.`);
              noResults = true;
              break;
            }

            if (m.replyMarkup?.rows) {
              let currentMsg = m;
              let pageCount = 0;
              const MAX_PAGES = effectiveMaxPages;

              while (currentMsg && pageCount < MAX_PAGES) {
                if (checkAborted()) break;
                pageCount++;
                activeBotMsg = currentMsg;
                activeBotPage = pageCount;
                let pageBtnCount = 0;
                let pageAcceptedCount = 0;
                if (currentMsg.replyMarkup?.rows) {
                  for (const row of currentMsg.replyMarkup.rows) {
                    for (const btn of row.buttons) {
                      pageBtnCount++;
                      const evalRes = scoreButton(btn, currentMsg);
                      const isAccepted = evalRes.score >= 0;
                      if (isAccepted) {
                        pageAcceptedCount++;
                        console.log(`[MSM EVAL] [Page ${pageCount}] "${btn.text}" -> score: ${evalRes.score} (ACCEPTED)`);
                      } else {
                        console.log(`[MSM EVAL] [Page ${pageCount}] "${btn.text}" -> score: ${evalRes.score} (REJECTED: ${evalRes.reason})`);
                      }
                      if (evalRes.score > -999) {
                        candidates.push({
                          msgId: currentMsg.id,
                          buttonId: btn.buttonId,
                          url: btn.url,
                          text: btn.text,
                          className: btn.className,
                          score: evalRes.score,
                          page: pageCount,
                        });
                      }
                    }
                  }
                }
                console.log(`[MSM EVAL] Page ${pageCount} summary for "${sq}": ${pageAcceptedCount} accepted out of ${pageBtnCount}`);

                if (pageCount >= MAX_PAGES || checkAborted()) break;

                const nextBtn = findNextPageButton(currentMsg.replyMarkup);
                if (nextBtn) {
                  console.log(`[MSM RESOLVE] Navigating to page ${pageCount + 1} for "${sq}" via callback...`);
                  try {
                    await this.client.invoke(new Api.messages.GetBotCallbackAnswer({
                      peer: targetBot,
                      msgId: currentMsg.id,
                      data: nextBtn.data,
                    }));
                    await new Promise(r => setTimeout(r, 1200));
                    const refreshed = await this.client.getMessages(targetBot, { ids: [currentMsg.id] });
                    if (refreshed && refreshed[0]) {
                      currentMsg = refreshed[0];
                      activeBotMsg = currentMsg;
                      activeBotPage = pageCount + 1;
                    } else {
                      break;
                    }
                  } catch (pErr) {
                    console.warn('[MSM RESOLVE] Pagination callback failed:', pErr.message);
                    break;
                  }
                } else {
                  break;
                }
              }
            }
          }
        }

        if (noResults || checkAborted()) break;

        const valid = candidates.filter(c => c.score >= 0).sort((a, b) => b.score - a.score);
        if (valid.length > 0) {
          const uniqueValid = [];
          const seenButtons = new Set();
          for (const c of valid) {
            const btnKey = c.buttonId || c.url;
            if (!seenButtons.has(btnKey)) {
              seenButtons.add(btnKey);
              uniqueValid.push(c);
            }
          }

          const candidatesToTry = uniqueValid;
          for (let candIdx = 0; candIdx < candidatesToTry.length; candIdx++) {
            if (checkAborted()) break;
            const cand = candidatesToTry[candIdx];
            console.log(`[MSM RESOLVE] Trying candidate (${candIdx + 1}/${candidatesToTry.length}): "${cand.text}" (score: ${cand.score}, page: ${cand.page || 1})...`);

            const targetMsgId = cand.msgId;
            let targetButtonId = cand.buttonId;
            const candidateFilename = cand.text.replace(/^[🔥🎞📎\s]+/, '').replace(/\s+\d+(\.\d+)?\s*(mb|gb).*$/i, '').trim();
            const linkMatch = cand.url ? cand.url.match(/\/link\/([a-zA-Z0-9_-]+)/) : null;
            const candShortcode = linkMatch ? linkMatch[1] : null;

            if (candShortcode && this.deadShortcodes.has(candShortcode)) {
              console.log(`[MSM RESOLVE] Skipping candidate "${cand.text}" (shortcode ${candShortcode} is known dead)`);
              continue;
            }

            const candTargetPage = cand.page || 1;
            if (activeBotMsg && activeBotPage !== candTargetPage) {
              console.log(`[MSM RESOLVE] Navigating message ${targetMsgId} to candidate page ${candTargetPage}...`);
              const navResult = await navigateToPage(this.client, targetBot, targetMsgId, candTargetPage, activeBotMsg, activeBotPage, checkAborted);
              activeBotMsg = navResult.msg;
              activeBotPage = navResult.page;
            }

            if (activeBotMsg?.replyMarkup?.rows) {
              for (const row of activeBotMsg.replyMarkup.rows) {
                for (const btn of row.buttons) {
                  if ((cand.url && btn.url === cand.url) || (cand.text && btn.text === cand.text)) {
                    targetButtonId = btn.buttonId;
                    break;
                  }
                }
              }
            }

            let authUrl = null;
            if (cand.className === 'KeyboardButtonUrl') {
              authUrl = cand.url;
            } else {
              let authRes;
              try {
                authRes = await this.client.invoke(new Api.messages.RequestUrlAuth({
                  peer: targetBot,
                  msgId: targetMsgId,
                  buttonId: targetButtonId,
                }));

                if (authRes?.className === 'UrlAuthResultRequest' || !authRes?.url) {
                  authRes = await this.client.invoke(new Api.messages.AcceptUrlAuth({
                    peer: targetBot,
                    msgId: targetMsgId,
                    buttonId: targetButtonId,
                    writeAllowed: true,
                  }));
                }
              } catch (authErr) {
                console.warn(`[MSM RESOLVE WARN] URL authorization failed for "${cand.text}": ${authErr.message}`);
                continue;
              }

              authUrl = authRes?.url || cand.url;
              if (!authUrl) continue;
            }

            const cookieMap = new Map();
            function processSetCookies(header) {
              if (!header) return;
              const list = Array.isArray(header) ? header : [header];
              for (const item of list) {
                const pair = item.split(';')[0];
                const [k, v] = pair.split('=');
                if (k && v) cookieMap.set(k.trim(), v.trim());
              }
            }

            let step1;
            try {
              step1 = await axiosWithRetry(
                () => axios.get(authUrl, {
                  maxRedirects: 0,
                  timeout: 25000,
                  validateStatus: (s) => s >= 200 && s < 400,
                  headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
                }),
                'Step 1 (ad-gate auth)',
                2,
                1000
              );
              processSetCookies(step1.headers['set-cookie']);
            } catch (step1Err) {
              console.warn(`[MSM RESOLVE WARN] Step 1 ad-gate failed for "${cand.text}": ${step1Err.message}`);
              continue;
            }

            const redirectPath = step1.headers['location'] || (authUrl.match(/\/link\/[^\s&?]+/)?.[0] || '/');
            const targetUrl = new URL(redirectPath, authUrl).toString();

            let step2;
            try {
              step2 = await axiosWithRetry(
                () => axios.get(targetUrl, {
                  timeout: 25000,
                  headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    Cookie: Array.from(cookieMap.entries()).map(([k, v]) => `${k}=${v}`).join('; '),
                    Referer: authUrl,
                  },
                }),
                'Step 2 (target page)',
                2,
                1000
              );
              processSetCookies(step2.headers['set-cookie']);
            } catch (step2Err) {
              console.warn(`[MSM RESOLVE WARN] Step 2 ad-gate failed for "${cand.text}": ${step2Err.message}`);
              continue;
            }

            const html = step2.data || '';
            const nonceMatch = html.match(/var\s+msmbotGetFileNonce\s*=\s*["']([^"']+)["']/i);
            const scMatch = html.match(/data-shortcode\s*=\s*["']([^"']+)["']/i) ||
                            html.match(/messageSent_.*?"([^"]+)".*?"video"/i) ||
                            html.match(/messageSent_.*?([a-zA-Z0-9_-]{5,20})/i);
            const shortcode = scMatch ? scMatch[1] : candShortcode;

            if (nonceMatch && shortcode) {
              const postData = new URLSearchParams({
                action: 'msmbot_getfile',
                _wpnonce: nonceMatch[1],
                file_shortcode: shortcode,
              });

              let forwardFailed = false;
              try {
                const ajaxRes = await axiosWithRetry(
                  () => axios.post(new URL('/wp-admin/admin-ajax.php', targetUrl).toString(), postData.toString(), {
                    timeout: 25000,
                    headers: {
                      'Content-Type': 'application/x-www-form-urlencoded',
                      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                      Cookie: Array.from(cookieMap.entries()).map(([k, v]) => `${k}=${v}`).join('; '),
                      Referer: targetUrl,
                    },
                  }),
                  'msmbot_getfile ajax',
                  2,
                  1000
                );
                if (ajaxRes.data?.data?.description === 'forward_failed' || (ajaxRes.data?.data && ajaxRes.data.data.ok === false)) {
                  forwardFailed = true;
                  if (shortcode) this.deadShortcodes.add(shortcode);
                  if (candShortcode) this.deadShortcodes.add(candShortcode);
                  if (this.deadShortcodes.size > 2000) this.deadShortcodes.clear();
                }
              } catch (postErr) {
                console.warn(`[MSM RESOLVE WARN] msmbot_getfile issue (${postErr.message}). Checking chat anyway...`);
              }

              if (forwardFailed) continue;
            }

            console.log(`[MSM RESOLVE] Waiting for media delivery from @${targetBot}...`);
            let candDeliveredDoc = null;
            let candDeliveredMsgId = null;
            let finalFilename = candidateFilename || queryTitle;

            for (let attempt = 0; attempt < 8; attempt++) {
              if (checkAborted()) break;
              await new Promise(r => setTimeout(r, 1500));
              if (checkAborted()) break;
              const incoming = await this.client.getMessages(targetBot, { limit: 10 });
              for (const im of incoming) {
                if (im.id > sentMsgId && im.media?.document) {
                  candDeliveredDoc = im.media.document;
                  candDeliveredMsgId = im.id;
                  const fnAttr = candDeliveredDoc.attributes?.find(a => a.className === 'DocumentAttributeFilename');
                  if (fnAttr) finalFilename = fnAttr.fileName;
                  break;
                }
              }
              if (candDeliveredDoc) break;
            }

            if (candDeliveredDoc) {
              deliveredDoc = candDeliveredDoc;
              deliveredMsgId = candDeliveredMsgId;
              resolvedFilename = finalFilename;
              break;
            }
          }

          break;
        }
      }

      if (deliveredDoc || checkAborted()) break;
    }

    if (checkAborted()) {
      const err = new Error('Client aborted resolution');
      err.status = 499;
      throw err;
    }

    if (!deliveredDoc) {
      return null;
    }

    const actualTier = detectVideoQualityTier(resolvedFilename || queryTitle, '', deliveredDoc, deliveredDoc.size);

    return {
      document: deliveredDoc,
      msgId: deliveredMsgId,
      filename: resolvedFilename || queryTitle,
      tier: actualTier,
    };
  }
}
