/**
 * Web-only fallback for the embed failover watchdog (issue #294).
 *
 * The watchdog stops when it hears playback from the embed (postMessage) or, in the Android app,
 * from the native audio check. On the web a cross-origin embed that sends no messages can never
 * be verified, so its countdown would run out over a video that is playing. For such providers the
 * player offers a manual "skip timeout" button once they have stayed silent for a grace period.
 */

/** How long an embed may stay silent before the manual skip-timeout button is offered. */
export const UNVERIFIABLE_GRACE_MS = 10000;

/** Providers with a dedicated message handler in VideoPlayer: a silent one has really failed. */
export const KNOWN_REPORTER_IDS: readonly string[] = ['vidlink', 'cinezo', 'cinesrc', 'moviesapi', 'megaplay-anime'];

const STORAGE_KEY = 'tmdb_embed_reporters';

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

function defaultStorage(): StorageLike | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

/** Provider ids that have posted a message to the page at least once (learned across sessions). */
export function loadReporters(storage: StorageLike | null = defaultStorage()): Set<string> {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

export function saveReporters(reporters: ReadonlySet<string>, storage: StorageLike | null = defaultStorage()): void {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify([...reporters]));
  } catch {
    // storage unavailable: the set simply is not remembered
  }
}

/**
 * True when playback of a still-unverified embed cannot be detected automatically: web only (no
 * native audio check), the embed has sent no message since it loaded, and the provider is not one
 * that normally reports playback.
 */
export function isPlaybackUnverifiable(args: {
  hasNativeBridge: boolean;
  providerId: string;
  frameMessageCount: number;
  reporters: ReadonlySet<string>;
}): boolean {
  if (args.hasNativeBridge) return false;
  if (args.frameMessageCount > 0) return false;
  if (KNOWN_REPORTER_IDS.includes(args.providerId) || args.reporters.has(args.providerId)) return false;
  return true;
}
