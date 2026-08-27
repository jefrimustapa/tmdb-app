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

export interface UpdateInfo {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
  releaseName: string;
  releaseNotes: string;
  publishedAt: string;
  apkUrl: string | null;
  apkName: string;
  isNightly: boolean;
  isPrerelease: boolean;
  htmlUrl: string;
}

// Compare semantic versions (returns >0 if v1 > v2, <0 if v1 < v2, 0 if equal)
function compareVersions(v1: string, v2: string): number {
  const clean1 = v1.replace(/^v/, '').split('-')[0].split('.').map(n => parseInt(n, 10) || 0);
  const clean2 = v2.replace(/^v/, '').split('-')[0].split('.').map(n => parseInt(n, 10) || 0);

  for (let i = 0; i < Math.max(clean1.length, clean2.length); i++) {
    const num1 = clean1[i] || 0;
    const num2 = clean2[i] || 0;
    if (num1 !== num2) return num1 - num2;
  }
  return 0;
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
          isNightly: false,
          isPrerelease: false,
          htmlUrl: 'https://github.com/jefrimustapa/tmdb-app/releases'
        };
      }

      const latest = eligibleReleases[0];
      const cleanTag = latest.tag_name.replace(/^v/, '');
      const isNightly = latest.prerelease || latest.tag_name.toLowerCase().includes('nightly');

      // Find APK asset
      const apkAsset = latest.assets.find(a => a.name.toLowerCase().endsWith('.apk'));
      const apkUrl = apkAsset ? apkAsset.browser_download_url : null;
      const apkName = apkAsset ? apkAsset.name : `tmdb-stream-v${cleanTag}.apk`;

      // Determine if it is actually newer than current build
      let hasUpdate = false;
      const versionDiff = compareVersions(cleanTag, APP_VERSION);

      if (versionDiff > 0) {
        hasUpdate = true;
      } else if (versionDiff === 0) {
        // If same base version, check if current is local dev or if nightly tag is newer
        if (APP_BUILD_CHANNEL === 'dev') {
          hasUpdate = true;
        } else if (isNightly && !APP_VERSION_FULL.includes(cleanTag)) {
          hasUpdate = true;
        }
      }

      return {
        hasUpdate,
        currentVersion: APP_VERSION_FULL,
        latestVersion: cleanTag,
        releaseName: latest.name || latest.tag_name,
        releaseNotes: latest.body || 'No release notes provided.',
        publishedAt: latest.published_at ? new Date(latest.published_at).toLocaleDateString() : '',
        apkUrl,
        apkName,
        isNightly,
        isPrerelease: latest.prerelease,
        htmlUrl: latest.html_url
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
      window.open(apkUrl, '_blank');
    }
  }
};
