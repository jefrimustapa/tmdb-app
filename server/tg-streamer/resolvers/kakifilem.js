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

// Parse target delivery bot and start parameter from a Telegram link (*.t.me, t.me, telegram.me, tg://)
export function parseTelegramDeliveryLink(url) {
  if (!url || typeof url !== 'string') return null;
  // Format 1: tg://resolve?domain=BOT&start=PARAM or &startapp=PARAM
  const tgMatch = url.match(/tg:\/\/resolve\?domain=([a-zA-Z0-9_]+)&(?:start|startapp)=([^\s&]+)/i);
  if (tgMatch) {
    return { botUsername: tgMatch[1], startParam: decodeURIComponent(tgMatch[2]) };
  }
  // Format 2: https?://<bot>.t.me/?start=PARAM or &startapp=PARAM
  const subMatch = url.match(/(?:https?:\/\/)?([a-zA-Z0-9_]+)\.t\.me\/?\?(?:start|startapp)=([^\s&]+)/i);
  if (subMatch) {
    return { botUsername: subMatch[1], startParam: decodeURIComponent(subMatch[2]) };
  }
  // Format 3: https?://t.me/<bot>?start=PARAM or https?://telegram.me/<bot>?start=PARAM
  const tmeMatch = url.match(/(?:https?:\/\/)?(?:t\.me|telegram\.me)\/([a-zA-Z0-9_]+)\?(?:start|startapp)=([^\s&]+)/i);
  if (tmeMatch) {
    return { botUsername: tmeMatch[1], startParam: decodeURIComponent(tmeMatch[2]) };
  }
  // Format 4: URL hostname parsing fallback
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    if (host.endsWith('.t.me')) {
      const bot = host.replace(/\.t\.me$/, '');
      const start = u.searchParams.get('start') || u.searchParams.get('startapp');
      if (bot && start) return { botUsername: bot, startParam: start };
    } else if (host === 't.me' || host === 'telegram.me') {
      const parts = u.pathname.split('/').filter(Boolean);
      const bot = parts[0];
      const start = u.searchParams.get('start') || u.searchParams.get('startapp');
      if (bot && start) return { botUsername: bot, startParam: start };
    }
  } catch (_) {}
  return null;
}

// Execute web delivery flow (e.g. bot.kakifilem.com) to trigger video delivery to Telegram
export async function triggerWebDelivery(url, options = {}) {
  const { customTrigger, myTelegramId = '127202180' } = options;
  if (typeof customTrigger === 'function') {
    return await customTrigger(url, options);
  }
  try {
    const res = await axios.get(url, {
      timeout: 10000,
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });

    const html = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
    const tokenMatch = html.match(/token["']?\s*:\s*["']([^"']+)["']/i);
    const tgIdMatch = html.match(/telegram_id["']?\s*:\s*["']?(\d+)["']?/i);

    if (tokenMatch) {
      const token = tokenMatch[1];
      const telegramId = tgIdMatch ? tgIdMatch[1] : myTelegramId;
      const origin = new URL(url).origin;
      console.log(`[KAKIFILEM WEB] Triggering send_video via ${origin}/send_video (token: ${token.slice(0, 5)}..., tgId: ${telegramId})...`);
      const postRes = await axios.post(`${origin}/send_video`, {
        token,
        telegram_id: telegramId,
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Referer': url,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
        timeout: 10000,
      });
      return { success: postRes.status >= 200 && postRes.status < 300, html };
    }

    // Check if web page contains direct Telegram start link
    const botLinkMatch = html.match(/https?:\/\/(?:([a-zA-Z0-9_]+)\.t\.me|t\.me\/([a-zA-Z0-9_]+)|telegram\.me\/([a-zA-Z0-9_]+))\?(?:start|startapp)=([^\s"'&]+)/i);
    if (botLinkMatch) {
      const bot = botLinkMatch[1] || botLinkMatch[2] || botLinkMatch[3];
      const startParam = botLinkMatch[4];
      return { success: true, botUsername: bot, startParam, html };
    }

    return { success: true, html };
  } catch (err) {
    console.warn(`[KAKIFILEM WEB WARN] Web delivery request failed for ${url}:`, err.message);
    return { success: false, error: err.message };
  }
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
    let deliveredBot = null;
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
                          msgText: currentMsg.message || '',
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

            // 1. Diagnostic logging on trigger branch (requirement a)
            const urlObj = cand.url ? (() => { try { return new URL(cand.url); } catch (_) { return null; } })() : null;
            const sanitizedUrl = urlObj ? `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}` : (cand.url ? String(cand.url).split('?')[0] : 'n/a');
            const dataLen = cand.data ? (Buffer.isBuffer(cand.data) ? cand.data.length : String(cand.data).length) : 0;
            const botMsgExcerpt = (cand.msgText || '').replace(/\r?\n/g, ' ').slice(0, 150);

            console.log(`[KAKIFILEM TRIGGER] Candidate button: class=${cand.className}, text="${cand.text}", urlHostPath="${sanitizedUrl}", dataLen=${dataLen}, botMsg="${botMsgExcerpt}"`);

            // 2. Identify delivery bot and Telegram links (requirement b)
            let tgLink = cand.url ? parseTelegramDeliveryLink(cand.url) : null;
            let deliveryBot = (tgLink?.botUsername || targetBot).replace(/^@/, '');
            let pollBots = Array.from(new Set([deliveryBot, targetBot].filter(Boolean)));

            // Pre-capture baseline message IDs across delivery bots
            const baselineMsgIds = {};
            await Promise.allSettled(
              pollBots.map(async b => {
                try {
                  const ms = await this.client.getMessages(b, { limit: 1 });
                  baselineMsgIds[b] = ms?.[0]?.id || 0;
                } catch (_) {
                  baselineMsgIds[b] = 0;
                }
              })
            );

            // 3. Trigger candidate delivery
            try {
              if (cand.className === 'KeyboardButtonCallback' && cand.data) {
                console.log(`[KAKIFILEM RESOLVE] Invoking GetBotCallbackAnswer for "${cand.text}" on @${targetBot}...`);
                await this.client.invoke(new Api.messages.GetBotCallbackAnswer({
                  peer: targetBot,
                  msgId: cand.msgId,
                  data: cand.data,
                }));
              } else if (cand.className === 'KeyboardButtonUrl') {
                if (tgLink) {
                  console.log(`[KAKIFILEM RESOLVE] Sending /start ${tgLink.startParam} to @${deliveryBot}...`);
                  try {
                    await this.client.sendMessage(deliveryBot, { message: `/start ${tgLink.startParam}` });
                  } catch (sendErr) {
                    if (sendErr.errorMessage === 'YOU_BLOCKED_USER' || (sendErr.message && sendErr.message.includes('YOU_BLOCKED_USER'))) {
                      console.warn(`[KAKIFILEM RESOLVE] Bot @${deliveryBot} is blocked. Auto-unblocking...`);
                      try {
                        await this.client.invoke(new Api.contacts.Unblock({ id: deliveryBot }));
                        await this.client.sendMessage(deliveryBot, { message: `/start ${tgLink.startParam}` });
                      } catch (unblockErr) {
                        console.error(`[KAKIFILEM RESOLVE] Failed to unblock @${deliveryBot}:`, unblockErr.message);
                      }
                    } else {
                      console.error(`[KAKIFILEM RESOLVE] Error sending to @${deliveryBot}:`, sendErr.message);
                    }
                  }
                } else if (cand.url) {
                  console.log(`[KAKIFILEM RESOLVE] Executing web delivery trigger for "${cand.text}" (${sanitizedUrl})...`);
                  const webRes = await triggerWebDelivery(cand.url, {
                    customTrigger: this.options.webDeliveryTrigger,
                  });
                  if (webRes?.botUsername && webRes?.startParam) {
                    const followBot = webRes.botUsername.replace(/^@/, '');
                    if (!pollBots.includes(followBot)) {
                      pollBots.push(followBot);
                      try {
                        const ms = await this.client.getMessages(followBot, { limit: 1 });
                        baselineMsgIds[followBot] = ms?.[0]?.id || 0;
                      } catch (_) {
                        baselineMsgIds[followBot] = 0;
                      }
                    }
                    console.log(`[KAKIFILEM RESOLVE] Web page extracted Telegram start link: /start ${webRes.startParam} to @${followBot}...`);
                    await this.client.sendMessage(followBot, { message: `/start ${webRes.startParam}` });
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
                  await triggerWebDelivery(authRes.url, {
                    customTrigger: this.options.webDeliveryTrigger,
                  });
                }
              }
            } catch (invokeErr) {
              console.warn(`[KAKIFILEM RESOLVE WARN] Candidate action invocation failed for "${cand.text}": ${invokeErr.message}`);
            }

            console.log(`[KAKIFILEM RESOLVE] Waiting for media delivery from ${pollBots.map(b => '@' + b).join(', ')}...`);
            let candDeliveredDoc = null;
            let candDeliveredMsgId = null;
            let candDeliveredBot = deliveryBot;
            let finalFilename = candidateFilename || queryTitle;
            const seenTriggerUrls = new Set(cand.url ? [cand.url] : []);

            for (let attempt = 0; attempt < 10; attempt++) {
              if (checkAborted()) break;
              const delayMs = this.options.pollDelayMs !== undefined
                ? this.options.pollDelayMs
                : (attempt < 3 ? 1000 : 1500);
              await new Promise(r => setTimeout(r, delayMs));
              if (checkAborted()) break;

              const currentPollBots = pollBots.slice();
              const pollResults = await Promise.allSettled(
                currentPollBots.map(b => this.client.getMessages(b, { limit: 10 }))
              );

              for (let bIdx = 0; bIdx < currentPollBots.length; bIdx++) {
                const b = currentPollBots[bIdx];
                const pres = pollResults[bIdx];
                const incoming = (pres && pres.status === 'fulfilled' && Array.isArray(pres.value)) ? pres.value : [];
                const baseId = baselineMsgIds[b] || 0;

                for (const im of incoming) {
                  if (im.id > baseId && !rejectedMsgIds.has(im.id)) {
                    // A. Document delivery check
                    if (im.media?.document) {
                      const doc = im.media.document;
                      const fnAttr = doc.attributes?.find(a => a.className === 'DocumentAttributeFilename');
                      const rawDocName = fnAttr ? fnAttr.fileName : '';
                      const isGeneric = !rawDocName || /^video_\d+/i.test(rawDocName) || /^file_\d+/i.test(rawDocName);
                      const docName = isGeneric ? (candidateFilename || queryTitle) : rawDocName;

                      let verdict = validateDeliveredDocument({ filename: docName, caption: im.message, sizeBytes: doc.size }, evalContext);
                      if (!verdict.ok && isGeneric && candidateFilename) {
                        verdict = validateDeliveredDocument({ filename: `${candidateFilename}.mp4`, caption: im.message, sizeBytes: doc.size }, evalContext);
                      }

                      if (!verdict.ok) {
                        rejectedMsgIds.add(im.id);
                        console.warn(`[KAKIFILEM RESOLVE] REJECT delivered document "${docName}" for "${queryTitle}" (${verdict.reason}), ignoring`);
                        continue;
                      }
                      console.log(`[KAKIFILEM RESOLVE] ACCEPT delivered document "${docName}" (score: ${verdict.score}, ${verdict.reason}) from @${b}`);
                      candDeliveredDoc = doc;
                      candDeliveredMsgId = im.id;
                      candDeliveredBot = b;
                      finalFilename = docName;
                      break;
                    }

                    // B. Secondary result card buttons check (e.g. after /start s_...)
                    if (im.replyMarkup?.rows) {
                      for (const row of im.replyMarkup.rows) {
                        for (const btn of row.buttons) {
                          if (btn.url && !seenTriggerUrls.has(btn.url)) {
                            seenTriggerUrls.add(btn.url);
                            console.log(`[KAKIFILEM RESOLVE] Following secondary delivery button "${btn.text}" (${btn.url.split('?')[0]})...`);
                            const subDelivery = parseTelegramDeliveryLink(btn.url);
                            if (subDelivery) {
                              const subBot = subDelivery.botUsername.replace(/^@/, '');
                              if (!pollBots.includes(subBot)) {
                                pollBots.push(subBot);
                                try {
                                  const ms = await this.client.getMessages(subBot, { limit: 1 });
                                  baselineMsgIds[subBot] = ms?.[0]?.id || 0;
                                } catch (_) {
                                  baselineMsgIds[subBot] = 0;
                                }
                              }
                              await this.client.sendMessage(subBot, { message: `/start ${subDelivery.startParam}` });
                            } else {
                              await triggerWebDelivery(btn.url, { customTrigger: this.options.webDeliveryTrigger });
                            }
                          }
                        }
                      }
                    }
                  }
                }
                if (candDeliveredDoc) break;
              }
              if (candDeliveredDoc) break;
            }

            if (candDeliveredDoc) {
              deliveredDoc = candDeliveredDoc;
              deliveredMsgId = candDeliveredMsgId;
              deliveredBot = candDeliveredBot;
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
      bot: deliveredBot || targetBot,
    };
  }
}
