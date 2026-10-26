// Pure helpers for the TGStrm Network Speed Analytics (issue #281).

export type SpeedTestTier = '720p' | '1080p' | '4k';
export const SPEEDTEST_TIERS: SpeedTestTier[] = ['720p', '1080p', '4k'];

export const SPEEDTEST_TIER_LABEL: Record<SpeedTestTier, string> = {
  '720p': '720p HD',
  '1080p': '1080p Full HD',
  '4k': '4K Ultra HD',
};

export type SpeedTestVerdict = 'ok' | 'marginal' | 'slow';

/**
 * 'network': the stream ran as fast as the router -> device link allows, so that link is the limit.
 * 'server': the stream was clearly slower than the link, so the limit is on the server side
 * (Telegram -> router, or the router itself).
 */
export type SpeedTestBottleneck = 'network' | 'server';

// The stream counts as "at the link's speed" when it reaches this share of the network baseline.
const NETWORK_LIMITED_SHARE = 0.85;

/** Megabits per second for `bytes` transferred in `ms` milliseconds (0 when there is nothing to measure). */
export function toMbps(bytes: number, ms: number): number {
  if (!(bytes > 0) || !(ms > 0)) return 0;
  return (bytes * 8) / (ms / 1000) / 1e6;
}

/**
 * Verdict against the quality's minimum (Netflix: 720p 3, 1080p 5, 4K 15 Mbps):
 * below 1.0x too slow, 1.0-1.5x marginal, 1.5x or more OK.
 */
export function computeVerdict(mbps: number, minMbps: number): SpeedTestVerdict {
  if (!(minMbps > 0)) return 'ok';
  const ratio = mbps / minMbps;
  if (ratio >= 1.5) return 'ok';
  if (ratio >= 1) return 'marginal';
  return 'slow';
}

/** Where the limit is, by comparing the stream rate with the network baseline; null without a baseline. */
export function computeBottleneck(streamMbps: number, baselineMbps: number | null | undefined): SpeedTestBottleneck | null {
  if (!baselineMbps || !(baselineMbps > 0)) return null;
  return streamMbps >= baselineMbps * NETWORK_LIMITED_SHARE ? 'network' : 'server';
}

export function formatMbps(mbps: number): string {
  if (!(mbps > 0)) return '0';
  return mbps >= 100 ? mbps.toFixed(0) : mbps.toFixed(1);
}
