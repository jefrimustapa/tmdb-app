import { APP_VERSION, APP_VERSION_FULL, APP_BUILD_NUMBER, APP_BUILD_CHANNEL } from '../version';

export interface GitHubReleaseAsset {
  name: string;
  browser_download_url: string;
  size: number;
  content_type: string;
}

export interface GitHubRelease {
  tag_name: string;
  name: string;
  body: string;
  draft: boolean;
  prerelease: boolean;
  published_at: string;
  html_url: string;
  assets: GitHubReleaseAsset[];
}

import { openExternalUrl } from './browserService';

export interface UpdateInfo {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
  releaseName: string;
  releaseNotes: string;
  publishedAt: string;
  apkUrl: string | null;
  apkName: string;
  apkSizeFormatted?: string;
  isNightly: boolean;
  isPrerelease: boolean;
  htmlUrl: string;
  fullChangelogUrl?: string | null;
}

const COMPARE_CACHE = new Map<string, string[]>();

function cleanCommitText(raw: string): string {
  let text = raw.replace(/^[\*\-•]\s*/, '').trim();
  // Strip GitHub PR author and URL suffix: e.g. "by @user in https://github.com/..."
  text = text.replace(/\s+by\s+@[a-zA-Z0-9_\-]+\s+in\s+https?:\/\/\S+/i, '');
  return text.trim();
}

function isNoiseCommit(msg: string): boolean {
  return /^(chore\(version\)|chore\(release\)|Merge pull request|Merge branch)/i.test(msg.trim());
}

export function extractReleaseHighlights(
  rawBody: string,
  maxHighlights = 5
): { highlights: string[]; fullChangelogUrl: string | null; total: number; hasMore: boolean } {
  const lines = rawBody.split('\n');
  const highlights: string[] = [];
  let fullChangelogUrl: string | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const changelogMatch = trimmed.match(/https?:\/\/github\.com\/[^\/]+\/[^\/]+\/compare\/\S+/i);
    if (changelogMatch) {
      fullChangelogUrl = changelogMatch[0].replace(/\)+$/, '');
      continue;
    }

    if (trimmed.startsWith('#') || trimmed.startsWith('---') || trimmed.startsWith('📦')) {
      continue;
    }

    const clean = cleanCommitText(trimmed);
    if (!clean || isNoiseCommit(clean)) {
      continue;
    }

    highlights.push(clean);
  }

  // Prioritize conventional commits: feat > fix > perf > ui > other
  const score = (msg: string) => {
    if (/^(feat|feature)/i.test(msg)) return 4;
    if (/^fix/i.test(msg)) return 3;
    if (/^perf/i.test(msg)) return 2;
    if (/^ui/i.test(msg)) return 1;
    return 0;
  };

  highlights.sort((a, b) => score(b) - score(a));
  const total = highlights.length;
  const top = highlights.slice(0, maxHighlights);

  return {
    highlights: top,
    fullChangelogUrl,
    total,
    hasMore: total > maxHighlights
  };
}

async function fetchCompareCommits(compareRange: string): Promise<string[]> {
  const cached = COMPARE_CACHE.get(compareRange);
  if (cached) return cached;

  try {
    const res = await fetch(`https://api.github.com/repos/jefrimustapa/tmdb-app/compare/${compareRange}`, {
      headers: { Accept: 'application/vnd.github.v3+json' }
    });
    if (!res.ok) return [];
    const data = await res.json();
    if (data && Array.isArray(data.commits)) {
      const msgs = data.commits.map((c: any) => (c.commit?.message || '').split('\n')[0]);
      COMPARE_CACHE.set(compareRange, msgs);
      return msgs;
    }
  } catch (err) {
    console.warn('[UpdateService] Failed to fetch compare commits:', err);
  }
  return [];
}

// Extract version from APK file name: e.g. "tmdb-stream-v1.2.0-nightly.20261017.81-debug.apk" -> "1.2.0-nightly.20261017.81"
export function extractVersionFromApkName(apkName: string): string | null {
  if (!apkName) return null;
  const match = apkName.match(/^tmdb-stream-v?(.+?)(?:-(?:debug|release))?\.apk$/i);
  return match ? match[1] : null;
}

// Extract CI run number: e.g. "1.2.0-nightly.20261017.81" or "...81-debug.apk" -> 81
export function extractRunNumber(str: string): number {
  if (!str) return 0;
  const match = str.match(/nightly[.-]\d{8}[.-](\d+)/i) || str.match(/\.(\d+)(?:-(?:debug|release))?\.apk$/i);
  return match ? parseInt(match[1], 10) : 0;
}

// Extract 8-digit date (YYYYMMDD): e.g. "nightly-20261017" or "20261017" -> 20261017
export function extractDateNumber(str: string): number {
  if (!str) return 0;
  const match = str.match(/\b\d{8}\b/) || str.match(/\d{8}/);
  return match ? parseInt(match[0], 10) : 0;
}

// Compare semantic versions (returns >0 if v1 > v2, <0 if v1 < v2, 0 if equal)
export function compareSemVer(v1: string, v2: string): number {
  const parse = (v: string) => {
    const clean = v.replace(/^v/, '').trim();
    const [mainPart, ...preParts] = clean.split('-');
    const nums = mainPart.split('.').map(n => parseInt(n, 10) || 0);
    while (nums.length < 3) nums.push(0);
    const pre = preParts.join('-');
    return { nums, pre };
  };

  const p1 = parse(v1);
  const p2 = parse(v2);

  for (let i = 0; i < Math.max(p1.nums.length, p2.nums.length); i++) {
    const n1 = p1.nums[i] || 0;
    const n2 = p2.nums[i] || 0;
    if (n1 !== n2) return n1 - n2;
  }

  // Official release without prerelease is higher than prerelease with same base
  if (!p1.pre && p2.pre) return 1;
  if (p1.pre && !p2.pre) return -1;
  if (!p1.pre && !p2.pre) return 0;

  return p1.pre.localeCompare(p2.pre, undefined, { numeric: true });
}

export function compareVersions(v1: string, v2: string): number {
  return compareSemVer(v1, v2);
}

export interface IsInstalledUpToDateParams {
  candidateVersion: string;
  candidateIsNightly: boolean;
  currentFullVersion: string;
  currentBuildNumber: string;
  currentChannel: string;
}

export function isInstalledUpToDate({
  candidateVersion,
  candidateIsNightly,
  currentFullVersion,
  currentBuildNumber,
  currentChannel
}: IsInstalledUpToDateParams): boolean {
  if (candidateIsNightly) {
    const candidateDate = extractDateNumber(candidateVersion);
    const candidateRun = extractRunNumber(candidateVersion);
    const localDate = extractDateNumber(currentFullVersion) || extractDateNumber(currentBuildNumber);
    const localRun = extractRunNumber(currentFullVersion);

    if (currentChannel === 'nightly') {
      if (candidateDate > localDate) return false;
      if (candidateDate < localDate) return true;
      // Same date: compare run number if both present
      if (candidateRun > 0 && localRun > 0) {
        return candidateRun <= localRun;
      }
      return true;
    }

    if (currentChannel === 'dev') {
      if (candidateDate > localDate) return false;
      return true;
    }

    // Stable/RC user opted into Nightly updates:
    const baseDiff = compareSemVer(candidateVersion, currentFullVersion);
    if (baseDiff > 0) return false;
    return false;
  }

  // Candidate is stable / pre-release
  if (currentChannel === 'dev') {
    const baseLocal = currentFullVersion.split('-')[0];
    const diff = compareSemVer(candidateVersion, baseLocal);
    return diff <= 0;
  }

  const diff = compareSemVer(candidateVersion, currentFullVersion);
  return diff <= 0;
}

export function isReleaseMatchingInstalled(
  rel: GitHubRelease,
  currentFullVersion: string,
  currentChannel: string
): boolean {
  const isNightly = rel.prerelease || /nightly/i.test(rel.tag_name);
  if (isNightly) {
    if (currentChannel !== 'nightly') return false;
    const relDate = extractDateNumber(rel.tag_name);
    const localDate = extractDateNumber(currentFullVersion);
    if (!relDate || !localDate || relDate !== localDate) return false;

    const localRun = extractRunNumber(currentFullVersion);
    if (localRun > 0) {
      const matchingAsset = (rel.assets || []).some(a => extractRunNumber(a.name) === localRun);
      if (matchingAsset) return true;
    }
    return true;
  }

  const cleanTag = rel.tag_name.replace(/^v/, '').trim();
  const cleanLocal = currentFullVersion.replace(/^v/, '').trim();
  return cleanTag === cleanLocal;
}

export const updateService = {
  async checkForUpdates(includeNightly: boolean = false): Promise<UpdateInfo> {
    try {
      const response = await fetch('https://api.github.com/repos/jefrimustapa/tmdb-app/releases?per_page=15', {
        headers: {
          'Accept': 'application/vnd.github.v3+json',
        }
      });

      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
      }

      const releases: GitHubRelease[] = await response.json();
      if (!Array.isArray(releases) || releases.length === 0) {
        return {
          hasUpdate: false,
          currentVersion: APP_VERSION_FULL,
          latestVersion: APP_VERSION_FULL,
          releaseName: 'Up to date',
          releaseNotes: '',
          publishedAt: '',
          apkUrl: null,
          apkName: '',
          apkSizeFormatted: undefined,
          isNightly: false,
          isPrerelease: false,
          htmlUrl: 'https://github.com/jefrimustapa/tmdb-app/releases'
        };
      }

      // Filter based on user preference (Stable vs Nightly/Pre-release)
      const eligibleReleases = releases.filter(r => {
        if (r.draft) return false;
        if (!includeNightly && r.prerelease) return false;
        return true;
      });

      if (eligibleReleases.length === 0) {
        return {
          hasUpdate: false,
          currentVersion: APP_VERSION_FULL,
          latestVersion: APP_VERSION_FULL,
          releaseName: 'Up to date',
          releaseNotes: '',
          publishedAt: '',
          apkUrl: null,
          apkName: '',
          apkSizeFormatted: undefined,
          isNightly: false,
          isPrerelease: false,
          htmlUrl: 'https://github.com/jefrimustapa/tmdb-app/releases'
        };
      }

      const latest = eligibleReleases[0];
      const cleanTag = latest.tag_name.replace(/^v/, '');
      const isNightly = latest.prerelease || latest.tag_name.toLowerCase().includes('nightly');

      // Find latest APK asset (sort descending by numeric run number so highest run number / latest APK is chosen)
      const apkAssets = (latest.assets || []).filter(a => a.name.toLowerCase().endsWith('.apk'));
      apkAssets.sort((a, b) => {
        const runA = extractRunNumber(a.name);
        const runB = extractRunNumber(b.name);
        if (runA !== runB) {
          return runB - runA;
        }
        return b.name.localeCompare(a.name);
      });
      const apkAsset = apkAssets[0];
      const apkUrl = apkAsset ? apkAsset.browser_download_url : null;
      const apkName = apkAsset ? apkAsset.name : `tmdb-stream-v${cleanTag}.apk`;
      const apkSizeFormatted = apkAsset?.size ? `${(apkAsset.size / (1024 * 1024)).toFixed(1)} MB` : undefined;

      const apkVersion = apkAsset ? extractVersionFromApkName(apkAsset.name) : null;
      const latestVersion = apkVersion || cleanTag;

      // Determine if it is actually newer than current build
      const hasUpdate = !isInstalledUpToDate({
        candidateVersion: latestVersion,
        candidateIsNightly: isNightly,
        currentFullVersion: APP_VERSION_FULL,
        currentBuildNumber: APP_BUILD_NUMBER,
        currentChannel: APP_BUILD_CHANNEL
      });

      // Aggregate release notes in chronological descending order (latest release first)
      const releaseNotesSections: string[] = [];
      let overallChangelogUrl: string | null = null;

      for (let i = 0; i < eligibleReleases.length; i++) {
        const rel = eligibleReleases[i];
        const relBody = rel.body ? rel.body.trim() : '';
        const relDate = rel.published_at ? new Date(rel.published_at).toLocaleDateString() : '';
        const relTitle = rel.name && rel.name !== rel.tag_name ? `${rel.name} (${rel.tag_name})` : rel.tag_name;
        const header = `📦 ${relTitle}${relDate ? ` • ${relDate}` : ''}`;

        let { highlights, fullChangelogUrl, hasMore, total } = extractReleaseHighlights(relBody, 5);
        if (!overallChangelogUrl && fullChangelogUrl) {
          overallChangelogUrl = fullChangelogUrl;
        }

        // If release body only had a compare link or lacked highlights, fetch commits from compare API
        if (highlights.length === 0) {
          let compareRange = '';
          if (fullChangelogUrl) {
            const match = fullChangelogUrl.match(/compare\/(\S+)/i);
            if (match) compareRange = match[1];
          } else if (i + 1 < eligibleReleases.length) {
            compareRange = `${eligibleReleases[i + 1].tag_name}...${rel.tag_name}`;
          }

          if (compareRange) {
            const commits = await fetchCompareCommits(compareRange);
            if (commits.length > 0) {
              const res = extractReleaseHighlights(commits.join('\n'), 5);
              highlights = res.highlights;
              hasMore = res.hasMore;
              total = res.total;
              if (!overallChangelogUrl) {
                overallChangelogUrl = `https://github.com/jefrimustapa/tmdb-app/compare/${compareRange}`;
              }
            }
          }
        }

        if (highlights.length > 0) {
          const lines = highlights.map(h => `* ${h}`);
          if (hasMore) {
            lines.push(`* + ${total - 5} more improvements`);
          }
          releaseNotesSections.push(`${header}\n${lines.join('\n')}`);
        } else if (relBody) {
          releaseNotesSections.push(`${header}\n${relBody}`);
        }

        // Stop after 3 recent releases to keep modal concise or when hitting current installed version
        if (releaseNotesSections.length >= 3 || isReleaseMatchingInstalled(rel, APP_VERSION_FULL, APP_BUILD_CHANNEL)) {
          break;
        }
      }

      const releaseNotes = releaseNotesSections.length > 0
        ? releaseNotesSections.join('\n\n━━━━━━━━━━━━━━━━━━━━\n\n')
        : (latest.body || 'Bug fixes, performance improvements, and media streaming updates.');

      return {
        hasUpdate,
        currentVersion: APP_VERSION_FULL,
        latestVersion,
        releaseName: latest.name || latest.tag_name,
        releaseNotes,
        publishedAt: latest.published_at ? new Date(latest.published_at).toLocaleDateString() : '',
        apkUrl,
        apkName,
        apkSizeFormatted,
        isNightly,
        isPrerelease: latest.prerelease,
        htmlUrl: latest.html_url,
        fullChangelogUrl: overallChangelogUrl || latest.html_url
      };
    } catch (e: any) {
      console.error('[UpdateService] Check failed:', e);
      throw e;
    }
  },

  installUpdate(apkUrl: string, apkName: string) {
    if (typeof window !== 'undefined' && (window as any).AndroidBridge && typeof (window as any).AndroidBridge.downloadAndInstallApk === 'function') {
      (window as any).AndroidBridge.downloadAndInstallApk(apkUrl, apkName);
    } else {
      // Fallback for browser
      openExternalUrl(apkUrl);
    }
  }
};
