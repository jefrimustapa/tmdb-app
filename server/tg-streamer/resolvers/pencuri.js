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
  generateSeriesSearchQueries,
} from './base.js';

// Search files directly from PencariMovie public search API
async function searchPencariApi(query) {
  try {
    const encoded = encodeURIComponent(query);
    const url = `https://unofficialsbot.pencarimovie.com/wp-admin/admin-ajax.php?action=stream_search_files&search=${encoded}`;
    const res = await axios.get(url, {
      timeout: 10000,
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
      timeout: 12000,
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
    const totalSeasons = totalSeasonsQuery ? parseInt(totalSeasonsQuery, 10) : NaN;
    const isTv = !isNaN(sNum) && !isNaN(eNum);
    const sPadded = isTv ? String(sNum).padStart(2, '0') : '';
    const epPadded = isTv ? String(eNum).padStart(2, '0') : '';
    const tvTag = isTv ? `S${sPadded}E${epPadded}` : '';
    const queryTitle = isTv ? `${title} ${tvTag}` : `${title} ${year || ''}`.trim();

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
              matchingRecentDocs.push({ doc, filename, msgId: msg.id, tier, bot: bName });
            }
          }
        }
      } catch (err) {
        console.warn(`[PENCURI CHAT] Error checking messages for @${bName}:`, err.message);
      }
    }

    if (matchingRecentDocs.length > 0) {
      const chosen = matchingRecentDocs[0];
      console.log(`[PENCURI RESOLVE] Found matching recent document in @${chosen.bot}: ${chosen.filename} (${chosen.tier})`);
      return {
        document: chosen.doc,
        filename: chosen.filename,
        msgId: chosen.msgId,
        tier: chosen.tier,
      };
    }

    // 2. Prepare prioritized search queries
    const cleanT = cleanSearchTitle(title);
    let effectiveAltTitle = altTitle ? cleanSearchTitle(altTitle) : '';
    const searchQueries = [];
    if (isTv) {
      searchQueries.push(...generateSeriesSearchQueries(cleanT, sNum, eNum, totalSeasons, year));
      if (cleanT !== title) {
        searchQueries.push(...generateSeriesSearchQueries(title, sNum, eNum, totalSeasons, year));
      }
      if (effectiveAltTitle && effectiveAltTitle.toLowerCase() !== cleanT.toLowerCase()) {
        searchQueries.push(...generateSeriesSearchQueries(effectiveAltTitle, sNum, eNum, totalSeasons, year));
      }
    } else {
      if (year) searchQueries.push(`${cleanT} ${year}`);
      searchQueries.push(cleanT);
      if (cleanT !== title) {
        if (year) searchQueries.push(`${title} ${year}`);
        searchQueries.push(title);
      }
      if (effectiveAltTitle && effectiveAltTitle.toLowerCase() !== cleanT.toLowerCase()) {
        if (year) searchQueries.push(`${effectiveAltTitle} ${year}`);
        searchQueries.push(effectiveAltTitle);
      }
    }

    const uniqueSearchQueries = Array.from(new Set(searchQueries));

    // 3. Query API for candidate files
    const candidateFiles = [];
    for (const sq of uniqueSearchQueries) {
      if (checkAborted()) break;
      console.log(`[PENCURI RESOLVE] Querying search API with "${sq}"...`);
      const files = await searchPencariApi(sq);
      if (files && files.length > 0) {
        for (const f of files) {
          candidateFiles.push(f);
        }
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
        if (targetQuality >= 2160 && tier === '4k') score += 50;
        else if (targetQuality >= 1080 && tier === '1080p') score += 40;
        else if (targetQuality >= 720 && tier === '720p') score += 30;
        else if (targetQuality <= 480 && tier === 'sd') score += 30;

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
      const sentMsg = await this.client.sendMessage(deliveryBot, { message: `/start ${startParam}` });
      const sentMsgId = sentMsg.id;

      // Poll for document delivery in both deliveryBot and targetBot
      let deliveredDoc = null;
      let deliveredMsgId = null;
      let resolvedFilename = file.title;

      for (let attempt = 0; attempt < 8; attempt++) {
        if (checkAborted()) break;
        await new Promise(r => setTimeout(r, 1500));
        if (checkAborted()) break;

        for (const b of [deliveryBot, targetBot]) {
          const incoming = await this.client.getMessages(b, { limit: 5 }).catch(() => []);
          for (const im of incoming) {
            if (im.id > sentMsgId && im.media?.document) {
              deliveredDoc = im.media.document;
              deliveredMsgId = im.id;
              const fnAttr = deliveredDoc.attributes?.find(a => a.className === 'DocumentAttributeFilename');
              if (fnAttr) resolvedFilename = fnAttr.fileName;
              break;
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
