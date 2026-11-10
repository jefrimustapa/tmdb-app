import { useSyncExternalStore } from 'react';

/**
 * Native Google Cast (Chromecast pulls the stream itself) for direct TGStrm streams.
 * The actual cast session lives in Android (CastManager.java); this module is the typed
 * wrapper over `window.AndroidBridge` plus a tiny shared store that polls the TV state.
 */

export interface NativeCastState {
  /** A cast session is connected and media was loaded on the TV */
  active: boolean;
  device: string;
  playing: boolean;
  positionSec: number;
  durationSec: number;
  /** Position at the moment the session last ended (used to resume local playback) */
  lastPositionSec: number | null;
}

const IDLE: NativeCastState = {
  active: false,
  device: '',
  playing: false,
  positionSec: 0,
  durationSec: 0,
  lastPositionSec: null,
};

const POLL_MS = 1000;
/** Give up waiting if the user dismisses the device chooser without picking a TV */
const CHOOSER_TIMEOUT_MS = 60000;

function bridge(): any {
  return typeof window !== 'undefined' ? (window as any).AndroidBridge : undefined;
}

/** True when the Android bridge exposes native cast and Play Services Cast is usable. */
export function canNativeCast(): boolean {
  const b = bridge();
  if (!b || typeof b.startNativeCast !== 'function') return false;
  try {
    return typeof b.nativeCastAvailable === 'function' ? !!b.nativeCastAvailable() : false;
  } catch {
    return false;
  }
}

/** Native cast is offered only for a direct stream source (TGStrm), never for embeds/iframes. */
export function shouldOfferNativeCast(directStreamUrl: string | null | undefined): boolean {
  return !!directStreamUrl && /^https?:\/\//i.test(directStreamUrl) && canNativeCast();
}

/** MIME type for the receiver, guessed from the file extension (query string ignored). */
export function guessContentType(url: string): string {
  const path = (url.split('?')[0] || '').toLowerCase();
  if (path.endsWith('.m3u8')) return 'application/x-mpegURL';
  if (path.endsWith('.mkv')) return 'video/x-matroska';
  if (path.endsWith('.webm')) return 'video/webm';
  return 'video/mp4';
}

let state: NativeCastState = IDLE;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;
let armedAt = 0;
let sawConnected = false;
let localPositionSec = 0;

function emit(next: NativeCastState) {
  state = next;
  listeners.forEach((l) => l());
}

function stopPolling() {
  if (timer) clearInterval(timer);
  timer = null;
}

function tick() {
  const b = bridge();
  if (!b || typeof b.getNativeCastState !== 'function') {
    stopPolling();
    return;
  }
  let s: any;
  try {
    s = JSON.parse(b.getNativeCastState());
  } catch {
    return;
  }
  if (s && s.connected) {
    sawConnected = true;
    emit({
      active: true,
      device: s.device || '',
      playing: !!s.playing,
      positionSec: Math.max(0, (Number(s.position) || 0) / 1000),
      durationSec: Math.max(0, (Number(s.duration) || 0) / 1000),
      lastPositionSec: null,
    });
    return;
  }
  if (sawConnected) {
    // Session ended (stopped from TV / connection lost / we stopped it)
    sawConnected = false;
    stopPolling();
    emit({ ...IDLE, lastPositionSec: state.positionSec });
  } else if (Date.now() - armedAt > CHOOSER_TIMEOUT_MS) {
    stopPolling();
  }
}

function armPolling() {
  armedAt = Date.now();
  if (!timer) timer = setInterval(tick, POLL_MS);
}

export const nativeCast = {
  getState: (): NativeCastState => state,
  subscribe(l: () => void): () => void {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
  /** Player reports its local position so the cast can start from there. */
  setLocalPosition(sec: number) {
    if (Number.isFinite(sec) && sec >= 0) localPositionSec = sec;
  },
  getLocalPosition: () => localPositionSec,
  /** Opens the device chooser; media loads on the TV as soon as a device is picked. */
  start(url: string, title: string, posterUrl?: string | null, positionSec: number = localPositionSec) {
    const b = bridge();
    if (!b || typeof b.startNativeCast !== 'function') return;
    b.startNativeCast(url, title || '', guessContentType(url), Math.round(Math.max(0, positionSec) * 1000), posterUrl || '');
    armPolling();
  },
  playPause() {
    bridge()?.nativeCastPlayPause?.();
  },
  seek(sec: number) {
    bridge()?.nativeCastSeek?.(Math.round(Math.max(0, sec) * 1000));
    if (state.active) emit({ ...state, positionSec: Math.max(0, sec) });
  },
  /** Ends the session and stops the TV. Safe to call when not casting. */
  stop() {
    if (!state.active && !sawConnected) return;
    bridge()?.nativeCastStop?.();
  },
  /** Reset for tests. */
  _reset() {
    stopPolling();
    sawConnected = false;
    localPositionSec = 0;
    emit(IDLE);
  },
};

export function useNativeCastState(): NativeCastState {
  return useSyncExternalStore(nativeCast.subscribe, nativeCast.getState, nativeCast.getState);
}
