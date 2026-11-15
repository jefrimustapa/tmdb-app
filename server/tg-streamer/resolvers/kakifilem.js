/**
 * Kakifilem Resolver - Telegram Bot Stream Resolver for @KakifilemBot
 * Module: server/tg-streamer/resolvers/kakifilem.js
 */

import { Api } from 'telegram';
import axios from 'axios';
import {
  BaseResolver,
  cleanSearchTitle,
  detectVideoQualityTier,
  extractSignificantTokens,
  buildSearchQueries,
  scoreCandidateWithReason,
  validateDeliveredDocument,
  parseSizeFromText,
} from './base.js';

// Score a candidate button from KakifilemBot
export function scoreKakifilemButton(btn, msg, evalContext = {}) {
  if (!btn) {
    return { score: -999, reason: 'missing button' };
  }
  const isSupported = btn.className === 'KeyboardButtonCallback' ||
                      btn.className === 'KeyboardButtonUrl' ||
                      btn.className === 'KeyboardButtonUrlAuth';
  if (!isSupported) {
    return { score: -999, reason: `unsupported button class: ${btn.className}` };
  }
  const btnText = btn.text || '';
  const msgText = msg?.message || '';
  const btnSizeMB = parseSizeFromText(btnText) || parseSizeFromText(msgText);
  return scoreCandidateWithReason({ text: btnText, contextText: msgText, sizeMB: btnSizeMB }, evalContext);
}

// Find pagination "Next" button in replyMarkup
export function findNextPageButton(replyMarkup) {
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

// Identity of a bot reply's visible state
export function botMessageState(msg) {
  const labels = (msg.replyMarkup?.rows || [])
    .flatMap(row => row.buttons.map(b => b.text || ''))
    .join(' ');
  return `${msg.id}|${msg.editDate || 0}|${labels}`;
}

export class KakifilemResolver extends BaseResolver {
  constructor(client, options = {}) {
    super(client, options);
    this.deadShortcodes = options.deadShortcodes || new Set();
  }

  get id() {
    return 'kakifilem';
  }

  get name() {
    return 'Kakifilem Bot';
  }

  get defaultBot() {
    return 'KakifilemBot';
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
      effectiveMinTv = 80,
      effectiveMinMovie = 180,
      effectiveMaxPages = 3,
      targetBot = (params.targetBot || this.options.targetBot || this.defaultBot).replace(/^@/, ''),
      checkAborted = () => false,
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

    const significantTokens = extractSignificantTokens(title);

    // 1. Prepare prioritized search queries (unified across resolvers)
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

    const evalContext = {
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
    };

    const rejectedMsgIds = new Set();

    for (const sq of uniqueSearchQueries) {
      if (checkAborted()) break;
      console.log(`[KAKIFILEM RESOLVE] Querying @${targetBot} with: "${sq}"...`);
      const sentMsg = await this.client.sendMessage(targetBot, { message: sq });
      const sentMsgId = sentMsg.id;

      let noResults = false;
      const candidates = [];
      const evaluatedStates = new Set();

      for (let poll = 0; poll < 8; poll++) {
        if (checkAborted()) break;
        await new Promise(r => setTimeout(r, 400));
        const msgs = await this.client.getMessages(targetBot, { limit: 5 });
        let sawReply = false;
        let evaluatedNew = false;

        for (const m of msgs) {
          if (m.id > sentMsgId) {
            const textLower = (m.message || '').toLowerCase();
            if (
              (!m.replyMarkup || !m.replyMarkup.rows || m.replyMarkup.rows.length === 0) &&
              (textLower.includes('tiada carian') ||
               textLower.includes('tidak dijumpai') ||
               textLower.includes('tiada hasil') ||
               textLower.includes('no result') ||
               textLower.includes('hanya taip tajuk filem'))
            ) {
              console.log(`[KAKIFILEM RESOLVE] Bot returned no results for "${sq}", advancing immediately.`);
              noResults = true;
              break;
            }

            if (m.replyMarkup?.rows) {
              sawReply = true;
              const stateKey = botMessageState(m);
              if (evaluatedStates.has(stateKey)) continue;
              evaluatedStates.add(stateKey);
              evaluatedNew = true;
              let currentMsg = m;
              let pageCount = 0;
              const MAX_PAGES = effectiveMaxPages;

              while (currentMsg && pageCount < MAX_PAGES) {
                if (checkAborted()) break;
                pageCount++;
                let pageBtnCount = 0;
                let pageAcceptedCount = 0;

                if (currentMsg.replyMarkup?.rows) {
                  for (const row of currentMsg.replyMarkup.rows) {
                    for (const btn of row.buttons) {
                      pageBtnCount++;
                      const evalRes = scoreKakifilemButton(btn, currentMsg, evalContext);
                      const isAccepted = evalRes.score >= 0;
                      if (isAccepted) {
                        pageAcceptedCount++;
                        console.log(`[KAKIFILEM EVAL] [Page ${pageCount}] "${btn.text}" -> score: ${evalRes.score} (ACCEPTED)`);
                      } else {
                        console.log(`[KAKIFILEM EVAL] [Page ${pageCount}] "${btn.text}" -> score: ${evalRes.score} (REJECTED: ${evalRes.reason})`);
                      }
                      if (evalRes.score > -999) {
                        candidates.push({
                          msgId: currentMsg.id,
                          buttonId: btn.buttonId,
                          url: btn.url,
                          data: btn.data,
                          text: btn.text,
                          className: btn.className,
                          score: evalRes.score,
                          page: pageCount,
                        });
                      }
                    }
                  }
                }
                console.log(`[KAKIFILEM EVAL] Page ${pageCount} summary for "${sq}": ${pageAcceptedCount} accepted out of ${pageBtnCount}`);

                if (pageCount >= MAX_PAGES || checkAborted()) break;

                const nextBtn = findNextPageButton(currentMsg.replyMarkup);
                if (nextBtn) {
                  console.log(`[KAKIFILEM RESOLVE] Navigating to page ${pageCount + 1} for "${sq}" via callback...`);
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
                      evaluatedStates.add(botMessageState(currentMsg));
                    } else {
                      break;
                    }
                  } catch (pErr) {
                    console.warn('[KAKIFILEM RESOLVE] Pagination callback failed:', pErr.message);
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
            const btnKey = (c.data ? c.data.toString('base64') : '') || c.buttonId || c.url || c.text;
            if (!seenButtons.has(btnKey)) {
              seenButtons.add(btnKey);
              uniqueValid.push(c);
            }
          }

          for (let candIdx = 0; candIdx < uniqueValid.length; candIdx++) {
            if (checkAborted()) break;
            const cand = uniqueValid[candIdx];
            console.log(`[KAKIFILEM RESOLVE] Trying candidate (${candIdx + 1}/${uniqueValid.length}): "${cand.text}" (score: ${cand.score}, page: ${cand.page || 1})...`);

            const candidateFilename = cand.text
              .replace(/^[🔥🎞📎🎬\s]+/, '')
              .replace(/\s*\([\d,]+(?:\.\d+)?\s*(?:mb|gb)\)\s*$/i, '')
              .replace(/\s+\d+(\.\d+)?\s*(mb|gb).*$/i, '')
              .trim();

            // Trigger candidate delivery
            try {
              if (cand.className === 'KeyboardButtonCallback' && cand.data) {
                console.log(`[KAKIFILEM RESOLVE] Invoking GetBotCallbackAnswer for "${cand.text}"...`);
                await this.client.invoke(new Api.messages.GetBotCallbackAnswer({
                  peer: targetBot,
                  msgId: cand.msgId,
                  data: cand.data,
                }));
              } else if (cand.className === 'KeyboardButtonUrl' && cand.url) {
                const startMatch = cand.url.match(/[?&]start=([a-zA-Z0-9_-]+)/);
                if (startMatch) {
                  const startPayload = startMatch[1];
                  console.log(`[KAKIFILEM RESOLVE] Sending /start ${startPayload} to @${targetBot}...`);
                  await this.client.sendMessage(targetBot, { message: `/start ${startPayload}` });
                } else {
                  try {
                    await axios.get(cand.url, { timeout: 15000, headers: { 'User-Agent': 'Mozilla/5.0' } });
                  } catch (uErr) {
                    console.warn(`[KAKIFILEM RESOLVE WARN] URL request failed: ${uErr.message}`);
                  }
                }
              } else if (cand.className === 'KeyboardButtonUrlAuth') {
                let authRes = await this.client.invoke(new Api.messages.RequestUrlAuth({
                  peer: targetBot,
                  msgId: cand.msgId,
                  buttonId: cand.buttonId,
                }));
                if (authRes?.className === 'UrlAuthResultRequest' || !authRes?.url) {
                  authRes = await this.client.invoke(new Api.messages.AcceptUrlAuth({
                    peer: targetBot,
                    msgId: cand.msgId,
                    buttonId: cand.buttonId,
                    writeAllowed: true,
                  }));
                }
                if (authRes?.url) {
                  await axios.get(authRes.url, { timeout: 15000, headers: { 'User-Agent': 'Mozilla/5.0' } });
                }
              }
            } catch (invokeErr) {
              console.warn(`[KAKIFILEM RESOLVE WARN] Candidate action invocation failed for "${cand.text}": ${invokeErr.message}`);
            }

            console.log(`[KAKIFILEM RESOLVE] Waiting for media delivery from @${targetBot}...`);
            let candDeliveredDoc = null;
            let candDeliveredMsgId = null;
            let finalFilename = candidateFilename || queryTitle;

            for (let attempt = 0; attempt < 8; attempt++) {
              if (checkAborted()) break;
              await new Promise(r => setTimeout(r, 1500));
              if (checkAborted()) break;
              const incoming = await this.client.getMessages(targetBot, { limit: 10 });
              for (const im of incoming) {
                if (im.id > sentMsgId && im.media?.document && !rejectedMsgIds.has(im.id)) {
                  const doc = im.media.document;
                  const fnAttr = doc.attributes?.find(a => a.className === 'DocumentAttributeFilename');
                  const docName = fnAttr ? fnAttr.fileName : (candidateFilename || queryTitle);

                  const verdict = validateDeliveredDocument({ filename: docName, caption: im.message, sizeBytes: doc.size }, evalContext);
                  if (!verdict.ok) {
                    rejectedMsgIds.add(im.id);
                    console.warn(`[KAKIFILEM RESOLVE] REJECT delivered document "${docName}" for "${queryTitle}" (${verdict.reason}), ignoring`);
                    continue;
                  }
                  console.log(`[KAKIFILEM RESOLVE] ACCEPT delivered document "${docName}" (score: ${verdict.score}, ${verdict.reason})`);
                  candDeliveredDoc = doc;
                  candDeliveredMsgId = im.id;
                  finalFilename = docName;
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
      bot: targetBot,
    };
  }
}
