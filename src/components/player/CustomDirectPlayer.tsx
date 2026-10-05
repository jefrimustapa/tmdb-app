import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
  Zap,
  Sparkles,
  Loader2
} from 'lucide-react';
import type Hls from 'hls.js';
import { tmdbImages, TMDB_FALLBACK_BACKDROP } from '../../services/tmdb';
import { useDevice } from '../../hooks/useDevice';

interface CustomDirectPlayerProps {
  src: string;
  title: string;
  posterPath?: string | null;
  backdropPath?: string | null;
  stillPath?: string | null;
  season?: number;
  episode?: number;
  episodeTitle?: string;
  mediaType: 'movie' | 'tv';
  providerLabel?: string;
  initialTimestamp?: number;
  totalDurationSec?: number;
  onProgress?: (currentTime: number, duration: number, isPaused?: boolean) => void;
  onEnded?: () => void;
  onError?: (err: any) => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  timeoutSeconds?: number;
}

const formatTime = (seconds: number): string => {
  if (isNaN(seconds) || seconds < 0) return '00:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

export const CustomDirectPlayer: React.FC<CustomDirectPlayerProps> = ({
  src,
  title,
  posterPath,
  backdropPath,
  stillPath,
  season,
  episode,
  episodeTitle,
  mediaType,
  providerLabel = 'Telegram (MSM32)',
  initialTimestamp = 0,
  totalDurationSec,
  onProgress,
  onEnded,
  onError,
  isFullscreen,
  onToggleFullscreen,
  timeoutSeconds = 90,
}) => {
  const { isTV } = useDevice();
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTapRef = useRef<{ time: number; x: number }>({ time: 0, x: 0 });
  const lastTouchTimeRef = useRef(0);
  const touchStartRef = useRef<{ time: number; x: number; y: number }>({ time: 0, x: 0, y: 0 });

  // Option C: On-demand Audio/Video Transcoding stream state & time offset
  const isTranscoded = typeof src === 'string' && (src.includes('transcode=') || /\.avi($|\?)/i.test(src));
  const baseOffsetRef = useRef<number>(isTranscoded && initialTimestamp > 10 ? Math.floor(initialTimestamp) : 0);
  const activeSrcRef = useRef<string>('');

  // Playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(initialTimestamp || 0);
  const [duration, setDuration] = useState(totalDurationSec || 0);
  const [bufferedPercent, setBufferedPercent] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);

  useEffect(() => {
    if (totalDurationSec && totalDurationSec > 0) {
      setDuration(totalDurationSec);
    }
  }, [totalDurationSec]);

  // Loading & Buffering states
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isBuffering, setIsBuffering] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState('Buffering...');

  // UI state
  const [showControls, setShowControls] = useState(true);
  const [isDraggingScrubber, setIsDraggingScrubber] = useState(false);
  const [scrubPreviewTime, setScrubPreviewTime] = useState<number | null>(null);
  const [seekFeedback, setSeekFeedback] = useState<'rwd' | 'fwd' | null>(null);
  const [seekDeltaTotal, setSeekDeltaTotal] = useState<number>(0);
  const [playFeedback, setPlayFeedback] = useState<'play' | 'pause' | null>(null);
  const [remoteHudFeedback, setRemoteHudFeedback] = useState<{ type: 'play' | 'pause' | 'fwd' | 'rwd'; delta?: number } | null>(null);

  const seekFeedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seekAccumulatorRef = useRef<number>(0);
  const playFeedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const remoteHudTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSeekTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const targetSeekTimeRef = useRef<number | null>(null);
  const scrubValueRef = useRef<number | null>(null);

  // Long-press continuous seek refs & cleanup (mobile touchscreen & mouse)
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isLongPressingRef = useRef(false);
  const suppressNextClickRef = useRef(false);
  const isSeekingRef = useRef(false);
  const seekSettleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearLongPress = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    if (longPressIntervalRef.current) {
      clearInterval(longPressIntervalRef.current);
      longPressIntervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      clearLongPress();
      if (seekFeedbackTimerRef.current) clearTimeout(seekFeedbackTimerRef.current);
      if (pendingSeekTimerRef.current) clearTimeout(pendingSeekTimerRef.current);
      if (remoteHudTimerRef.current) clearTimeout(remoteHudTimerRef.current);
      if (playFeedbackTimerRef.current) clearTimeout(playFeedbackTimerRef.current);
      if (seekSettleTimerRef.current) clearTimeout(seekSettleTimerRef.current);
    };
  }, [clearLongPress]);

  const hasSeekedInitialRef = useRef(false);
  const seekWatchdogTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isPlayingRef = useRef(false);

  // Auto-hide controls helper (ONLY hides if actively playing after 3 seconds)
  const resetControlsTimer = useCallback(() => {
    setShowControls(true);
    if (controlsTimerRef.current) {
      clearTimeout(controlsTimerRef.current);
    }
    // Only auto-hide if playing and not actively dragging scrubber
    if (isPlayingRef.current && !isDraggingScrubber) {
      controlsTimerRef.current = setTimeout(() => {
        setShowControls(false);
      }, 3000);
    }
  }, [isDraggingScrubber]);

  // Keep controls persistently visible whenever paused
  useEffect(() => {
    isPlayingRef.current = isPlaying;
    if (!isPlaying) {
      setShowControls(true);
      if (controlsTimerRef.current) {
        clearTimeout(controlsTimerRef.current);
      }
    } else {
      resetControlsTimer();
    }
  }, [isPlaying, resetControlsTimer]);

  const BUFFERING_TIMEOUT_SEC = 20;
  const [loadTimedOut, setLoadTimedOut] = useState(false);
  const [bufferingCountdown, setBufferingCountdown] = useState<number>(BUFFERING_TIMEOUT_SEC);

  // 20s hardcoded buffering watchdog timeout with live countdown
  useEffect(() => {
    if (!isInitialLoading) {
      setLoadTimedOut(false);
      return;
    }
    setBufferingCountdown(BUFFERING_TIMEOUT_SEC);
    const interval = setInterval(() => {
      setBufferingCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          console.warn(`[CustomDirectPlayer] Load took > ${BUFFERING_TIMEOUT_SEC}s, enabling manual controls`);
          setLoadTimedOut(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      clearInterval(interval);
    };
  }, [isInitialLoading]);

  const attachedSrcRef = useRef<string | null>(null);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  // Cleanup on unmount to completely stop background playback/buffering
  useEffect(() => {
    return () => {
      const video = videoRef.current;
      if (video) {
        try {
          video.pause();
          video.removeAttribute('src');
          video.load();
        } catch {}
      }
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      if (pendingSeekTimerRef.current) {
        clearTimeout(pendingSeekTimerRef.current);
      }
      if (seekWatchdogTimerRef.current) {
        clearTimeout(seekWatchdogTimerRef.current);
      }
    };
  }, []);

  const attemptInitialSeek = useCallback((el: HTMLVideoElement) => {
    if (initialTimestamp <= 5 || hasSeekedInitialRef.current || isTranscoded) return;

    // In Matroska (MKV), the Cues (seek index) are at the END of the container.
    // At readyState 1 (HAVE_METADATA), the browser has only parsed the header.
    // readyState must be >= 2 (HAVE_CURRENT_DATA) so Chromium's demuxer has loaded the cues.
    if (el.readyState < 2) {
      console.log(`[CustomDirectPlayer] Deferring initial seek to ${initialTimestamp}s: readyState is ${el.readyState} (< 2)`);
      return;
    }

    try {
      console.log(`[CustomDirectPlayer] Executing initial seek to ${initialTimestamp}s (current: ${el.currentTime}s, duration: ${el.duration}s, readyState: ${el.readyState})`);
      el.currentTime = initialTimestamp;
      setCurrentTime(initialTimestamp);
      hasSeekedInitialRef.current = true;
    } catch (err) {
      console.warn('[CustomDirectPlayer] Initial seek error:', err);
    }
  }, [initialTimestamp, isTranscoded]);

  // Video Source Attachment (HLS or Native MP4/MKV)
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    // CRITICAL: Prevent re-attachment loop if src has not changed!
    if (attachedSrcRef.current === src) {
      return;
    }
    attachedSrcRef.current = src;

    setIsInitialLoading(true);
    setIsBuffering(false);
    hasSeekedInitialRef.current = false;

    if (src.includes('.m3u8')) {
      let isCancelled = false;

      import('hls.js').then(({ default: Hls }) => {
        if (isCancelled || !videoRef.current) return;

        if (Hls.isSupported()) {
          if (hlsRef.current) {
            hlsRef.current.destroy();
          }

          const hls = new Hls({
            enableWorker: false,
            lowLatencyMode: false,
            backBufferLength: 15, // Reduce from 90s to 15s to save 150MB-250MB RAM
            maxBufferLength: 30,  // Target 30s forward buffer
            maxMaxBufferLength: 60, // Hard ceiling of 60s
            maxBufferSize: 30 * 1000 * 1000, // 30 MB max buffer capacity
            maxBufferHole: 0.5,
            fragLoadingMaxRetry: 5,
            fragLoadingRetryDelay: 1000,
            fragLoadingTimeOut: 25000,
          });

          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            setIsInitialLoading(false);
            video.play().catch(() => {});
          });

          hls.on(Hls.Events.ERROR, (_event, data) => {
            if (data.fatal) {
              switch (data.type) {
                case Hls.ErrorTypes.NETWORK_ERROR:
                  hls.startLoad();
                  break;
                case Hls.ErrorTypes.MEDIA_ERROR:
                  hls.recoverMediaError();
                  break;
                default:
                  hls.destroy();
                  onErrorRef.current?.(data);
                  break;
              }
            }
          });

          hls.loadSource(src);
          hls.attachMedia(video);
          hlsRef.current = hls;
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
          video.src = src;
        }
      }).catch((err) => {
        console.error('[HLS] Failed to dynamically load hls.js in CustomDirectPlayer:', err);
        if (!isCancelled && videoRef.current) {
          videoRef.current.src = src;
        }
      });

      return () => {
        isCancelled = true;
        if (hlsRef.current) {
          hlsRef.current.destroy();
          hlsRef.current = null;
        }
        attachedSrcRef.current = null;
      };
    } else {
      // Direct stream URL (MP4 / MKV from MSM32)
      video.muted = false;
      video.volume = 1;
      setIsMuted(false);

      let targetSrc = src;
      if (isTranscoded && initialTimestamp > 10) {
        baseOffsetRef.current = Math.floor(initialTimestamp);
        const urlObj = new URL(src, window.location.href);
        urlObj.searchParams.set('ss', baseOffsetRef.current.toString());
        targetSrc = urlObj.toString();
        hasSeekedInitialRef.current = true;
      } else {
        baseOffsetRef.current = 0;
      }
      activeSrcRef.current = targetSrc;
      video.src = targetSrc;

      let isCancelled = false;

      const triggerUnmutedPlay = () => {
        if (isCancelled) return;
        video.muted = false;
        video.volume = 1;
        setIsMuted(false);
        video.play().then(() => {
          if (isCancelled) {
            try {
              video.pause();
            } catch {}
            return;
          }
          setIsPlaying(true);
          isPlayingRef.current = true;
        }).catch((err) => {
          if (isCancelled) return;
          console.warn('[CustomDirectPlayer] Autoplay blocked, waiting for user tap:', err);
          setIsPlaying(false);
          isPlayingRef.current = false;
          setShowControls(true);
        });
      };

      let fired = false;
      const onReadyToPlay = () => {
        if (fired || isCancelled) return;
        fired = true;
        video.removeEventListener('loadeddata', onReadyToPlay);
        video.removeEventListener('canplay', onReadyToPlay);
        triggerUnmutedPlay();
      };

      if (video.readyState >= 2) {
        triggerUnmutedPlay();
      } else {
        video.addEventListener('loadeddata', onReadyToPlay, { once: true });
        video.addEventListener('canplay', onReadyToPlay, { once: true });
      }

      return () => {
        isCancelled = true;
        attachedSrcRef.current = null;
        video.removeEventListener('loadeddata', onReadyToPlay);
        video.removeEventListener('canplay', onReadyToPlay);
        try {
          video.pause();
          video.removeAttribute('src');
          video.load();
        } catch {}
      };
    }
  }, [src]);

  // Option C: Universal seek execution for both direct and transcoded pipes
  const performSeek = useCallback((targetTime: number) => {
    const video = videoRef.current;
    if (!video) return;
    const maxDur = duration || (totalDurationSec || 0) || video.duration || 0;
    const clamped = Math.max(0, maxDur > 0 ? Math.min(maxDur - 0.5, targetTime) : targetTime);
    const seekSeconds = Math.floor(clamped);

    if (isTranscoded) {
      if (seekWatchdogTimerRef.current) {
        clearTimeout(seekWatchdogTimerRef.current);
        seekWatchdogTimerRef.current = null;
      }

      const wasPlaying = isPlayingRef.current || !video.paused;
      baseOffsetRef.current = seekSeconds;
      const rawSrc = activeSrcRef.current || src;
      const urlObj = new URL(rawSrc, window.location.href);
      urlObj.searchParams.set('ss', seekSeconds.toString());
      const newSrc = urlObj.toString();
      activeSrcRef.current = newSrc;
      setIsBuffering(true);

      // Immediately clear seek locks for UI so scrubber displays correct seek position
      isSeekingRef.current = false;
      targetSeekTimeRef.current = null;

      let isCurrentSeek = true;
      const triggerPlayAfterLoad = () => {
        if (!isCurrentSeek || !video) return;
        video.muted = false;
        video.volume = 1;
        setIsMuted(false);
        video.play().then(() => {
          if (!isCurrentSeek) return;
          setIsPlaying(true);
          isPlayingRef.current = true;
          setIsBuffering(false);
          isSeekingRef.current = false;
          targetSeekTimeRef.current = null;
          if (seekWatchdogTimerRef.current) {
            clearTimeout(seekWatchdogTimerRef.current);
            seekWatchdogTimerRef.current = null;
          }
        }).catch((err) => {
          if (!isCurrentSeek) return;
          console.warn('[CustomDirectPlayer] Play after seek error:', err);
          setIsBuffering(false);
          isSeekingRef.current = false;
          targetSeekTimeRef.current = null;
          setShowControls(true);
        });
      };

      video.src = newSrc;

      if (wasPlaying) {
        // Trigger play immediately within gesture call stack to preserve mobile user activation
        video.play().catch(() => {
          // If browser rejects immediate play before metadata is ready, wait for ready events
          if (video.readyState >= 2) {
            triggerPlayAfterLoad();
          } else {
            const onReadyToPlay = () => {
              video.removeEventListener('canplay', onReadyToPlay);
              video.removeEventListener('loadeddata', onReadyToPlay);
              triggerPlayAfterLoad();
            };
            video.addEventListener('canplay', onReadyToPlay, { once: true });
            video.addEventListener('loadeddata', onReadyToPlay, { once: true });
          }
        });
      } else {
        const onLoaded = () => {
          video.removeEventListener('loadeddata', onLoaded);
          video.removeEventListener('canplay', onLoaded);
          if (!isCurrentSeek) return;
          setIsBuffering(false);
          isSeekingRef.current = false;
          targetSeekTimeRef.current = null;
        };
        video.addEventListener('loadeddata', onLoaded, { once: true });
        video.addEventListener('canplay', onLoaded, { once: true });
      }

      // 25s seek watchdog for remote Telegram transcode negotiation
      seekWatchdogTimerRef.current = setTimeout(() => {
        if (isCurrentSeek) {
          console.warn('[CustomDirectPlayer] Seek response took > 25s, clearing buffering state');
          setIsBuffering(false);
          isSeekingRef.current = false;
          targetSeekTimeRef.current = null;
          setShowControls(true);
        }
      }, 25000);

      setCurrentTime(clamped);
      onProgress?.(clamped, maxDur, !wasPlaying);
    } else {
      isSeekingRef.current = true;
      video.currentTime = clamped;
      setCurrentTime(clamped);
      onProgress?.(clamped, maxDur, video.paused);

      if (seekSettleTimerRef.current) clearTimeout(seekSettleTimerRef.current);
      seekSettleTimerRef.current = setTimeout(() => {
        isSeekingRef.current = false;
        targetSeekTimeRef.current = null;
      }, 400);
    }
  }, [isTranscoded, src, duration, totalDurationSec, onProgress]);

  // Handle Play/Pause with automatic reconnection if idle stream was evicted by server
  const handleTogglePlay = useCallback((fromRemote = false) => {
    const video = videoRef.current;
    if (!video) return;

    if (video.paused) {
      video.muted = false;
      setIsMuted(false);

      // If stream was disconnected or dropped while paused/idle, re-connect cleanly at current position
      if (isTranscoded && (video.error || video.networkState === HTMLMediaElement.NETWORK_NO_SOURCE || video.readyState <= 1)) {
        const effectiveCurrent = baseOffsetRef.current + video.currentTime;
        console.log(`[CustomDirectPlayer] Reconnecting idle transcode stream at ${effectiveCurrent}s...`);
        performSeek(effectiveCurrent);
        return;
      }

      video.play().catch((err) => {
        console.warn('[CustomDirectPlayer] Video play failed, attempting auto-reconnect:', err);
        if (isTranscoded) {
          const effectiveCurrent = baseOffsetRef.current + video.currentTime;
          performSeek(effectiveCurrent);
        } else {
          try {
            video.load();
            video.play().catch(console.warn);
          } catch {}
        }
      });
      setIsPlaying(true);
      if (isTV && fromRemote) {
        if (remoteHudTimerRef.current) clearTimeout(remoteHudTimerRef.current);
        setRemoteHudFeedback({ type: 'play' });
        remoteHudTimerRef.current = setTimeout(() => {
          setRemoteHudFeedback(null);
        }, 700);
      }
    } else {
      video.pause();
      setIsPlaying(false);
      if (isTV && fromRemote) {
        if (remoteHudTimerRef.current) clearTimeout(remoteHudTimerRef.current);
        setRemoteHudFeedback({ type: 'pause' });
        remoteHudTimerRef.current = setTimeout(() => {
          setRemoteHudFeedback(null);
        }, 700);
      }
    }

    resetControlsTimer();
  }, [isTV, isTranscoded, performSeek, resetControlsTimer]);

  // Auto-pause playback when app goes to background (Android TV Home, user switches apps)
  useEffect(() => {
    const handleVisibilityChange = () => {
      const video = videoRef.current;
      if (!video) return;
      if (document.visibilityState === 'hidden') {
        if (!video.paused) {
          console.log('[CustomDirectPlayer] App moved to background, pausing playback');
          video.pause();
          setIsPlaying(false);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Handle Relative Seek (+10s or -10s) with 280ms commit debouncing
  // Updates the visual UI & HUD immediately, but debounces the actual hardware seek
  // to avoid flooding the stream with aborted Range requests on rapid skip taps.
  const handleSeekRelative = useCallback((seconds: number, fromRemote = false) => {
    const video = videoRef.current;
    if (!video) return;

    const effectiveCurrent = isTranscoded ? (baseOffsetRef.current + video.currentTime) : video.currentTime;
    const currentBase = targetSeekTimeRef.current !== null ? targetSeekTimeRef.current : effectiveCurrent;
    const maxDur = duration || (totalDurationSec || 0) || video.duration || 0;
    const newTime = Math.max(0, maxDur > 0 ? Math.min(maxDur, currentBase + seconds) : currentBase + seconds);
    targetSeekTimeRef.current = newTime;
    setCurrentTime(newTime);

    // Accumulate consecutive seeks if triggered within 800ms for central button animation (All devices)
    seekAccumulatorRef.current = (seekAccumulatorRef.current === 0 || (seconds > 0 && seekAccumulatorRef.current < 0) || (seconds < 0 && seekAccumulatorRef.current > 0))
      ? seconds
      : seekAccumulatorRef.current + seconds;
    setSeekDeltaTotal(seekAccumulatorRef.current);
    setSeekFeedback(seekAccumulatorRef.current > 0 ? 'fwd' : 'rwd');

    if (seekFeedbackTimerRef.current) clearTimeout(seekFeedbackTimerRef.current);
    seekFeedbackTimerRef.current = setTimeout(() => {
      setSeekFeedback(null);
      seekAccumulatorRef.current = 0;
      setSeekDeltaTotal(0);
    }, 800);

    // Floating HUD Notification (Play, Pause, +/-10s in center) ONLY on TV when using remote
    if (isTV && fromRemote) {
      if (remoteHudTimerRef.current) clearTimeout(remoteHudTimerRef.current);
      setRemoteHudFeedback({
        type: seconds > 0 ? 'fwd' : 'rwd',
        delta: seekAccumulatorRef.current,
      });
      remoteHudTimerRef.current = setTimeout(() => {
        setRemoteHudFeedback(null);
      }, 800);
    }

    // Debounce actual hardware seek commit by 280ms
    if (pendingSeekTimerRef.current) clearTimeout(pendingSeekTimerRef.current);
    pendingSeekTimerRef.current = setTimeout(() => {
      if (videoRef.current && targetSeekTimeRef.current !== null) {
        performSeek(targetSeekTimeRef.current);
      }
    }, 280);

    resetControlsTimer();
  }, [isTV, isTranscoded, duration, totalDurationSec, performSeek, resetControlsTimer]);

  // Reusable event bindings for seek buttons supporting instant tap & long-press continuous seek
  const createSeekButtonProps = useCallback((seconds: number) => {
    return {
      onPointerDown: (e: React.PointerEvent) => {
        if (e.button !== 0 && e.pointerType === 'mouse') return;
        e.stopPropagation();
        const btn = e.currentTarget as HTMLElement;
        try {
          btn.setPointerCapture?.(e.pointerId);
        } catch {}
        clearLongPress();
        isLongPressingRef.current = false;
        suppressNextClickRef.current = false;

        // Long press threshold: 350ms before continuous seeking kicks in
        longPressTimerRef.current = setTimeout(() => {
          isLongPressingRef.current = true;
          suppressNextClickRef.current = true;
          handleSeekRelative(seconds);

          // Continuous cadence: 160ms per tick (matches TV remote D-pad auto-repeat)
          longPressIntervalRef.current = setInterval(() => {
            handleSeekRelative(seconds);
          }, 160);
        }, 350);
      },
      onPointerUp: (e: React.PointerEvent) => {
        e.stopPropagation();
        try {
          (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
        } catch {}
        clearLongPress();
        isLongPressingRef.current = false;
      },
      onPointerCancel: (e: React.PointerEvent) => {
        e.stopPropagation();
        try {
          (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
        } catch {}
        clearLongPress();
        isLongPressingRef.current = false;
      },
      onClick: (e: React.MouseEvent) => {
        e.stopPropagation();
        if (suppressNextClickRef.current) {
          suppressNextClickRef.current = false;
          return;
        }
        handleSeekRelative(seconds);
      },
      onContextMenu: (e: React.MouseEvent) => {
        e.preventDefault();
      },
    };
  }, [clearLongPress, handleSeekRelative]);

  // Handle toggling controls visibility with timer reset
  const handleToggleControls = useCallback(() => {
    setShowControls((prev) => {
      const next = !prev;
      if (next) {
        resetControlsTimer();
      } else if (controlsTimerRef.current) {
        clearTimeout(controlsTimerRef.current);
      }
      return next;
    });
  }, [resetControlsTimer]);

  // Touch Start: record touch down position and time
  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    const touch = e.touches[0];
    touchStartRef.current = {
      time: Date.now(),
      x: touch.clientX,
      y: touch.clientY,
    };
  };

  // Touch End: differentiate tap vs drag vs double-tap
  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    // If touched a button or interactive element, let the button handle it
    if ((e.target as HTMLElement).closest('button, input, [role="button"]')) return;

    const touch = e.changedTouches[0];
    const now = Date.now();
    const deltaX = Math.abs(touch.clientX - touchStartRef.current.x);
    const deltaY = Math.abs(touch.clientY - touchStartRef.current.y);
    const duration = now - touchStartRef.current.time;

    // Reject long presses or drag/scroll gestures
    if (deltaX > 20 || deltaY > 20 || duration > 400) {
      return;
    }

    // Mark touch time to suppress Android WebView synthetic ghost click in onClick
    lastTouchTimeRef.current = now;

    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const tapX = touch.clientX - rect.left;
    const width = rect.width;
    const timeDiff = now - lastTapRef.current.time;

    if (timeDiff < 300) {
      // Double tap detected -> relative seek or toggle play
      if (tapX < width * 0.35) {
        handleSeekRelative(-10);
      } else if (tapX > width * 0.65) {
        handleSeekRelative(10);
      } else {
        handleTogglePlay();
      }
      lastTapRef.current = { time: 0, x: 0 };
    } else {
      // Single tap -> toggle controls visibility cleanly
      lastTapRef.current = { time: now, x: tapX };
      handleToggleControls();
    }
  };

  // Scrubber dragging
  const handleScrubberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(e.target.value);
    if (!isNaN(newTime)) {
      scrubValueRef.current = newTime;
      setScrubPreviewTime(newTime);
      setCurrentTime(newTime);
    }
  };

  const handleScrubberCommit = (e?: React.SyntheticEvent<HTMLInputElement>) => {
    let commitTime = scrubValueRef.current;
    if ((commitTime === null || isNaN(commitTime)) && e?.currentTarget) {
      const val = parseFloat(e.currentTarget.value);
      if (!isNaN(val)) commitTime = val;
    }
    if (commitTime !== null && !isNaN(commitTime)) {
      performSeek(commitTime);
    }
    scrubValueRef.current = null;
    setIsDraggingScrubber(false);
    setScrubPreviewTime(null);
    resetControlsTimer();
  };

  // Toggle Mute
  const handleToggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setIsMuted(video.muted);
    resetControlsTimer();
  };

  // Keyboard & Remote Control Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input
      const target = e.target as HTMLElement;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName)) return;

      const isHeaderActive = !!(window as any).__tmdbHeaderFocused || 
        !!document.querySelector('[data-watch-header="true"]')?.contains(document.activeElement);
      const isModalActive = !!document.querySelector('[role="dialog"]');
      if (isModalActive) return;

      const key = e.key;
      const code = e.code;
      const keyCode = e.keyCode || e.which;

      // 1. PLAY / PAUSE (Remote Media Play/Pause, Space, K, or D-pad Enter/Select when not on a header button)
      const isPlayPauseKey = (
        key === 'MediaPlayPause' ||
        key === 'MediaPlay' ||
        key === 'MediaPause' ||
        key === 'Play' ||
        key === 'Pause' ||
        code === 'Space' ||
        code === 'KeyK' ||
        keyCode === 85 ||  // KEYCODE_MEDIA_PLAY_PAUSE
        keyCode === 126 || // KEYCODE_MEDIA_PLAY
        keyCode === 127 || // KEYCODE_MEDIA_PAUSE
        keyCode === 179    // KEYCODE_PAUSE
      );

      const isSelectKey = (
        (key === 'Enter' || key === 'Select' || code === 'Enter' || code === 'NumpadEnter' || keyCode === 13 || keyCode === 23 || keyCode === 66) &&
        !isHeaderActive &&
        !target?.closest('button, [role="button"]')
      );

      if (isPlayPauseKey || isSelectKey) {
        e.preventDefault();
        e.stopPropagation();
        handleTogglePlay(true);
        return;
      }

      // 2. FAST FORWARD (+10s)
      const isFastForwardKey = (
        key === 'MediaFastForward' ||
        key === 'FastForward' ||
        keyCode === 90 ||  // KEYCODE_MEDIA_FAST_FORWARD
        keyCode === 228 || // KEYCODE_FORWARD
        keyCode === 272 || // KEYCODE_MEDIA_STEP_FORWARD
        code === 'KeyL' ||
        (!isHeaderActive && (key === 'ArrowRight' || code === 'ArrowRight' || keyCode === 39 || keyCode === 22))
      );

      if (isFastForwardKey) {
        e.preventDefault();
        e.stopPropagation();
        handleSeekRelative(10, true);
        return;
      }

      // 3. REWIND (-10s)
      const isRewindKey = (
        key === 'MediaRewind' ||
        key === 'Rewind' ||
        keyCode === 89 ||  // KEYCODE_MEDIA_REWIND
        keyCode === 227 || // KEYCODE_MEDIA_REWIND
        keyCode === 273 || // KEYCODE_MEDIA_STEP_BACKWARD
        code === 'KeyJ' ||
        (!isHeaderActive && (key === 'ArrowLeft' || code === 'ArrowLeft' || keyCode === 37 || keyCode === 21))
      );

      if (isRewindKey) {
        e.preventDefault();
        e.stopPropagation();
        handleSeekRelative(-10, true);
        return;
      }

      // 4. MUTE (M key)
      if (code === 'KeyM' || keyCode === 77) {
        e.preventDefault();
        handleToggleMute();
        return;
      }

      // 5. FULLSCREEN (F key)
      if (code === 'KeyF' || keyCode === 70) {
        e.preventDefault();
        onToggleFullscreen();
        return;
      }

      // 6. D-pad Down: Show player controls & scrubber
      if (!isHeaderActive && (key === 'ArrowDown' || keyCode === 40 || keyCode === 20)) {
        setShowControls(true);
        resetControlsTimer();
        return;
      }

      // 7. Back / Escape: If controls are visible, hide controls first
      if ((key === 'Escape' || key === 'Back' || keyCode === 27 || keyCode === 4) && showControls && isPlayingRef.current) {
        setShowControls(false);
        if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
        return;
      }
    };

    // 1. Native Android & TV Remote Toggle Play/Pause
    const handleTogglePlayPauseEvent = () => {
      handleTogglePlay(true);
    };

    // 2. Pause Player (When modals or dialogs open - silent pause, no HUD feedback)
    const handlePausePlayerEvent = () => {
      const video = videoRef.current;
      if (video && !video.paused) {
        video.pause();
        setIsPlaying(false);
      }
    };

    // 3. Execute Seek (Dispatched from Watch.tv on remote D-pad Left/Right debounced seek)
    const handleExecuteSeekEvent = (e: any) => {
      const detail = e.detail || {};
      const delta = typeof detail.delta === 'number' ? detail.delta : 0;
      const video = videoRef.current;
      if (!video) return;

      if (typeof detail.targetTime === 'number') {
        performSeek(detail.targetTime);
      } else if (delta !== 0) {
        handleSeekRelative(delta, true);
      }
      resetControlsTimer();
    };

    // 4. Show Player Controls (Dispatched on TV D-pad Down when playing)
    const handleShowControlsEvent = () => {
      setShowControls(true);
      resetControlsTimer();
    };

    // 5. Custom Event listener for native Android media keycodes forwarded from MainActivity
    const handleRemoteMediaEvent = (e: any) => {
      const keyCode = e.detail?.keyCode;
      if (!keyCode) return;

      if (keyCode === 85 || keyCode === 126 || keyCode === 127 || keyCode === 179) {
        handleTogglePlay(true);
      } else if (keyCode === 90 || keyCode === 228 || keyCode === 272) {
        handleSeekRelative(10, true);
      } else if (keyCode === 89 || keyCode === 227 || keyCode === 273) {
        handleSeekRelative(-10, true);
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('tmdb_toggle_play_pause', handleTogglePlayPauseEvent);
    window.addEventListener('tmdb_pause_player', handlePausePlayerEvent);
    window.addEventListener('tmdb_execute_seek', handleExecuteSeekEvent);
    window.addEventListener('tmdb_show_player_controls', handleShowControlsEvent);
    window.addEventListener('tmdb_remote_media_key', handleRemoteMediaEvent);

    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('tmdb_toggle_play_pause', handleTogglePlayPauseEvent);
      window.removeEventListener('tmdb_pause_player', handlePausePlayerEvent);
      window.removeEventListener('tmdb_execute_seek', handleExecuteSeekEvent);
      window.removeEventListener('tmdb_show_player_controls', handleShowControlsEvent);
      window.removeEventListener('tmdb_remote_media_key', handleRemoteMediaEvent);
    };
  }, [handleTogglePlay, handleSeekRelative, handleToggleMute, onToggleFullscreen, resetControlsTimer, showControls, duration, onProgress]);

  // Image assets for backdrop
  const backdropUrl = stillPath
    ? tmdbImages.still(stillPath, 'original')
    : backdropPath
    ? tmdbImages.backdrop(backdropPath, 'w780')
    : posterPath
    ? tmdbImages.poster(posterPath, 'w500')
    : TMDB_FALLBACK_BACKDROP;

  const posterUrl = posterPath
    ? tmdbImages.poster(posterPath, 'w342')
    : stillPath
    ? tmdbImages.still(stillPath, 'w300')
    : null;

  const displayCurrentTime = scrubPreviewTime !== null
    ? scrubPreviewTime
    : (targetSeekTimeRef.current !== null ? targetSeekTimeRef.current : currentTime);

  const playedPercent = duration > 0 ? Math.min(100, Math.max(0, (displayCurrentTime / duration) * 100)) : 0;

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-black select-none overflow-hidden group"
      onMouseMove={resetControlsTimer}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onClick={(e) => {
        // Suppress synthetic ghost click generated by Android WebView right after a touch event
        if (Date.now() - lastTouchTimeRef.current < 500) return;
        if ((e.target as HTMLElement).closest('button, input, [role="button"]')) return;
        handleToggleControls();
      }}
    >
      {/* HTML5 Video Element (controls disabled to eradicate native Android WebView placeholder) */}
      <video
        ref={videoRef}
        controls={false}
        autoPlay
        playsInline
        webkit-playsinline="true"
        preload="auto"
        poster="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"
        muted={isMuted}
        className="w-full h-full object-contain bg-black transform-gpu will-change-transform"
        onLoadedMetadata={(e) => {
          const el = e.currentTarget;
          if (totalDurationSec && totalDurationSec > 0) {
            setDuration(totalDurationSec);
          } else if (el.duration > 0) {
            setDuration(el.duration);
          }
          // Do not seek here: MKV cues are at the end of the container and not yet parsed
          setIsInitialLoading(false);
          setIsBuffering(false);
        }}
        onCanPlay={(e) => {
          const el = e.currentTarget;
          attemptInitialSeek(el);
          setIsInitialLoading(false);
          setIsBuffering(false);
        }}
        onLoadedData={(e) => {
          const el = e.currentTarget;
          attemptInitialSeek(el);
          setIsInitialLoading(false);
          setIsBuffering(false);
        }}
        onSeeked={(e) => {
          const el = e.currentTarget;
          if (initialTimestamp > 5 && Math.abs(el.currentTime - initialTimestamp) < 5) {
            console.log(`[CustomDirectPlayer] Initial seek confirmed at ${el.currentTime}s`);
            hasSeekedInitialRef.current = true;
          }
          setIsBuffering(false);
          isSeekingRef.current = false;
          targetSeekTimeRef.current = null;
          if (seekSettleTimerRef.current) {
            clearTimeout(seekSettleTimerRef.current);
            seekSettleTimerRef.current = null;
          }
        }}
        onWaiting={(e) => {
          const el = e.currentTarget;
          const bufferedEnd = el.buffered.length > 0 ? el.buffered.end(el.buffered.length - 1) : 0;
          console.warn(`[DirectPlayer] Waiting for buffer at ${el.currentTime.toFixed(1)}s (buffer ahead: ${(bufferedEnd - el.currentTime).toFixed(1)}s)`);
          setIsBuffering(true);
        }}
        onStalled={(e) => {
          const el = e.currentTarget;
          console.warn(`[DirectPlayer] Stream stalled at ${el.currentTime.toFixed(1)}s`);
        }}
        onPlaying={(e) => {
          const el = e.currentTarget;
          if (!hasSeekedInitialRef.current && initialTimestamp > 5 && el.currentTime < 2) {
            attemptInitialSeek(el);
          }
          setIsInitialLoading(false);
          setIsBuffering(false);
          setIsPlaying(true);
          isSeekingRef.current = false;
          targetSeekTimeRef.current = null;
        }}
        onPause={(e) => {
          setIsPlaying(false);
          const el = e.currentTarget;
          const effectiveCurrent = isTranscoded ? (baseOffsetRef.current + el.currentTime) : el.currentTime;
          const effectiveDuration = (totalDurationSec && totalDurationSec > 0) ? totalDurationSec : (duration > 0 ? duration : el.duration);
          onProgress?.(effectiveCurrent, effectiveDuration, true);
        }}
        onSeeking={() => {
          isSeekingRef.current = true;
        }}
        onTimeUpdate={(e) => {
          const el = e.currentTarget;
          if (isBuffering && !el.paused) {
            setIsBuffering(false);
          }
          if (!hasSeekedInitialRef.current && initialTimestamp > 5 && el.currentTime < 2 && el.readyState >= 2) {
            attemptInitialSeek(el);
          }
          const effectiveCurrent = isTranscoded ? (baseOffsetRef.current + el.currentTime) : el.currentTime;
          const effectiveDuration = (totalDurationSec && totalDurationSec > 0) ? totalDurationSec : (duration > 0 ? duration : el.duration);
          
          // CRITICAL: Block background playback time updates while actively holding seek or dragging scrubber
          const isActivelySeeking = isDraggingScrubber || targetSeekTimeRef.current !== null || isSeekingRef.current;
          if (!isActivelySeeking) {
            setCurrentTime(effectiveCurrent);
          }
          // Compute buffered percentage
          if (el.buffered.length > 0 && effectiveDuration > 0) {
            const bufferedEnd = el.buffered.end(el.buffered.length - 1);
            const totalBuffered = isTranscoded ? (baseOffsetRef.current + bufferedEnd) : bufferedEnd;
            setBufferedPercent(Math.min(100, (totalBuffered / effectiveDuration) * 100));
          }
          onProgress?.(effectiveCurrent, effectiveDuration, el.paused);
        }}
        onEnded={() => {
          setIsPlaying(false);
          onEnded?.();
        }}
        onError={(e) => {
          console.error('[CustomDirectPlayer] Video error:', e);
          setIsInitialLoading(false);
          onError?.(e);
        }}
      />

      {/* ========================================================================= */}
      {/* CINEMATIC LOADING SCREEN (Replaces ugly native WebView black circle)       */}
      {/* ========================================================================= */}
      {isInitialLoading && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center overflow-hidden bg-black/90 backdrop-blur-xl animate-fade-in p-6 text-center">
          {/* Blurred Cinematic Backdrop */}
          {backdropUrl && (
            <img
              src={backdropUrl}
              alt=""
              className="absolute inset-0 w-full h-full object-cover opacity-25 filter blur-2xl scale-110 pointer-events-none"
              loading="eager"
            />
          )}

          {/* Vignette Overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/80 to-black/60 pointer-events-none" />

          {/* Central Card */}
          <div className="relative z-10 flex flex-col items-center max-w-sm px-4">
            {/* Poster / Thumbnail with subtle glow */}
            {posterUrl && (
              <div className="w-20 sm:w-24 aspect-[2/3] rounded-xl overflow-hidden shadow-[0_0_30px_rgba(103,58,183,0.35)] border border-white/20 mb-4 transform hover:scale-105 transition">
                <img src={posterUrl} alt={title} className="w-full h-full object-cover" />
              </div>
            )}

            {/* Clean White Spinner */}
            <div className="relative mb-3 flex items-center justify-center">
              <Loader2 className="w-12 h-12 text-white/80 animate-spin" />
            </div>

            {/* Title & Info */}
            <h3 className="text-base sm:text-lg font-black text-white tracking-tight line-clamp-1 mb-1 font-display">
              {title}
            </h3>

            {mediaType === 'tv' && (
              <p className="text-xs text-hbo-purple-light font-bold mb-2">
                Season {season} • Episode {episode} {episodeTitle ? `• ${episodeTitle}` : ''}
              </p>
            )}

            {/* Source Pill */}
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-hbo-cyan/15 border border-hbo-cyan/40 text-hbo-cyan text-[11px] font-bold shadow-[0_0_15px_rgba(0,210,255,0.25)] mb-3">
              <Zap className="w-3.5 h-3.5" />
              <span>{providerLabel}</span>
            </div>

            {/* Live Progress Ticker or Timeout Actions */}
            {loadTimedOut ? (
              <div className="flex flex-col items-center gap-2 mt-2">
                <p className="text-xs text-amber-300 font-medium">
                  Connection is taking longer than usual
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setLoadTimedOut(false);
                      setBufferingCountdown(BUFFERING_TIMEOUT_SEC);
                      if (videoRef.current) {
                        videoRef.current.load();
                        videoRef.current.play().catch(console.warn);
                      }
                    }}
                    className="px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-hbo-purple to-hbo-cyan text-white text-xs font-bold shadow-hbo-glow active:scale-95 transition"
                  >
                    Retry Play
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsInitialLoading(false);
                      onError?.({ message: 'Playback timeout' });
                    }}
                    className="px-3.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-semibold border border-white/20 active:scale-95 transition"
                  >
                    Switch Server
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                {bufferingCountdown > 0 && (
                  <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-hbo-purple/20 border border-hbo-cyan/30 text-xs font-semibold text-hbo-cyan tracking-wide animate-pulse">
                    <span className="w-2 h-2 rounded-full bg-hbo-cyan animate-ping" />
                    <span>Buffer Timeout in <strong className="text-white font-mono text-sm ml-0.5">{bufferingCountdown}s</strong></span>
                  </div>
                )}
                <p className="text-xs text-gray-300 font-medium tracking-wide animate-pulse">
                  {loadingStatus}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* FLOATING HUD FEEDBACK (PLAY, PAUSE, SEEK +10s / -10s ONLY ON TV VIA REMOTE) */}
      {/* ========================================================================= */}
      {isTV && remoteHudFeedback && !isInitialLoading && (
        <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none transition-all duration-200">
          {remoteHudFeedback.type === 'fwd' && (
            <div className="flex items-center gap-3.5 px-6 py-3.5 rounded-2xl bg-black/85 backdrop-blur-md border border-white/20 shadow-[0_0_50px_rgba(0,0,0,0.9)] text-white animate-scale-up">
              <RotateCw className="w-8 h-8 text-hbo-cyan animate-pulse" />
              <span className="text-2xl font-black font-display tracking-wide">
                +{Math.abs(remoteHudFeedback.delta || 10)}s
              </span>
            </div>
          )}
          {remoteHudFeedback.type === 'rwd' && (
            <div className="flex items-center gap-3.5 px-6 py-3.5 rounded-2xl bg-black/85 backdrop-blur-md border border-white/20 shadow-[0_0_50px_rgba(0,0,0,0.9)] text-white animate-scale-up">
              <RotateCcw className="w-8 h-8 text-hbo-cyan animate-pulse" />
              <span className="text-2xl font-black font-display tracking-wide">
                -{Math.abs(remoteHudFeedback.delta || 10)}s
              </span>
            </div>
          )}
          {remoteHudFeedback.type === 'play' && (
            <div className="flex items-center gap-3.5 px-6 py-3.5 rounded-2xl bg-black/85 backdrop-blur-md border border-white/20 shadow-[0_0_50px_rgba(0,0,0,0.9)] text-white animate-scale-up">
              <Play className="w-8 h-8 fill-current text-emerald-400" />
              <span className="text-xl font-black font-display tracking-wide uppercase">
                Play
              </span>
            </div>
          )}
          {remoteHudFeedback.type === 'pause' && (
            <div className="flex items-center gap-3.5 px-6 py-3.5 rounded-2xl bg-black/85 backdrop-blur-md border border-white/20 shadow-[0_0_50px_rgba(0,0,0,0.9)] text-white animate-scale-up">
              <Pause className="w-8 h-8 fill-current text-amber-400" />
              <span className="text-xl font-black font-display tracking-wide uppercase">
                Pause
              </span>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* HTML5 CUSTOM CONTROLS OVERLAY (PLAY, FWD, RWD, SCRUBBER, THEME MATCHED)   */}
      {/* ========================================================================= */}
      <div
        className={`absolute inset-0 z-20 transition-opacity duration-300 pointer-events-none ${
          (showControls || isBuffering || seekFeedback) && !isInitialLoading ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {/* Center Action Controls: Rewind 10s, Loading/Play/Pause, Forward 10s (True vertical & horizontal center) */}
        <div className="absolute inset-0 flex items-center justify-center gap-10 sm:gap-14 pointer-events-none p-4 sm:p-6">
          {/* Rewind 10s Button - Visual Seek Feedback on Center Control */}
          <button
            type="button"
            {...createSeekButtonProps(-10)}
            title="Rewind 10s"
            aria-label="Rewind 10 seconds"
            className={`relative p-2 text-white bg-transparent border-0 transition-opacity duration-150 flex items-center justify-center pointer-events-auto select-none ${
              seekFeedback === 'rwd'
                ? 'opacity-100 text-cyan-400'
                : 'opacity-70 hover:opacity-100'
            }`}
          >
            <RotateCcw className={`w-10 h-10 sm:w-12 sm:h-12 transition-transform duration-200 ${seekFeedback === 'rwd' ? 'scale-110 -rotate-12' : ''}`} />
            <span className="absolute text-[10px] sm:text-xs font-black">
              {seekFeedback === 'rwd' ? `${seekDeltaTotal ? seekDeltaTotal : -10}s` : '10'}
            </span>
          </button>

          {/* Main Play / Pause / Loading Spinner Button */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (isBuffering) return;
              handleTogglePlay();
            }}
            title={isBuffering ? 'Buffering...' : isPlaying ? 'Pause' : 'Play'}
            aria-label={isBuffering ? 'Buffering...' : isPlaying ? 'Pause' : 'Play'}
            className="p-3 text-white opacity-70 hover:opacity-100 active:scale-90 transition-all flex items-center justify-center bg-transparent border-0 pointer-events-auto"
          >
            {isBuffering ? (
              <Loader2 className="w-14 h-14 sm:w-16 sm:h-16 animate-spin text-white opacity-90" />
            ) : isPlaying ? (
              <Pause className="w-14 h-14 sm:w-16 sm:h-16 fill-current" />
            ) : (
              <Play className="w-14 h-14 sm:w-16 sm:h-16 fill-current translate-x-1" />
            )}
          </button>

          {/* Forward 10s Button - Visual Seek Feedback on Center Control */}
          <button
            type="button"
            {...createSeekButtonProps(10)}
            title="Forward 10s"
            aria-label="Forward 10 seconds"
            className={`relative p-2 text-white bg-transparent border-0 transition-opacity duration-150 flex items-center justify-center pointer-events-auto select-none ${
              seekFeedback === 'fwd'
                ? 'opacity-100 text-cyan-400'
                : 'opacity-70 hover:opacity-100'
            }`}
          >
            <RotateCw className={`w-10 h-10 sm:w-12 sm:h-12 transition-transform duration-200 ${seekFeedback === 'fwd' ? 'scale-110 rotate-12' : ''}`} />
            <span className="absolute text-[10px] sm:text-xs font-black">
              {seekFeedback === 'fwd' ? `+${seekDeltaTotal ? seekDeltaTotal : 10}s` : '10'}
            </span>
          </button>
        </div>

        {/* Standard End-to-End Bottom Bar: Scrubber, Timers, Volume */}
        <div className="absolute bottom-0 left-0 right-0 w-full px-4 sm:px-6 pt-6 pb-4 sm:pb-6 pointer-events-auto space-y-2.5 bg-gradient-to-t from-black/80 via-black/40 to-transparent">

          {/* Progress / Scrub Bar */}
          <div className="relative flex items-center w-full group/scrubber cursor-pointer">
            {/* Background Track */}
            <div className="w-full h-1.5 sm:h-2 bg-white/20 rounded-full overflow-hidden relative">
              {/* Buffered Progress */}
              <div
                className="absolute top-0 left-0 h-full bg-white/30 rounded-full transition-all duration-300"
                style={{ width: `${Math.min(100, bufferedPercent)}%` }}
              />
              {/* Played Progress */}
              <div
                className={`absolute top-0 left-0 h-full bg-gradient-to-r from-hbo-purple-light to-hbo-cyan rounded-full ${
                  isDraggingScrubber || targetSeekTimeRef.current !== null || isSeekingRef.current
                    ? 'transition-none'
                    : 'transition-[width] duration-150 ease-out'
                }`}
                style={{ width: `${Math.min(100, playedPercent)}%` }}
              />
            </div>

            {/* Interactive HTML5 Range Input */}
            <input
              type="range"
              min={0}
              max={duration || 100}
              step={0.1}
              value={displayCurrentTime}
              onChange={handleScrubberChange}
              onMouseDown={() => setIsDraggingScrubber(true)}
              onTouchStart={() => setIsDraggingScrubber(true)}
              onMouseUp={(e) => handleScrubberCommit(e)}
              onTouchEnd={(e) => handleScrubberCommit(e)}
              onClick={(e) => handleScrubberCommit(e)}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              aria-label="Seek Slider"
            />
          </div>

          {/* Bottom Controls Row: Play/Pause, Rewind, Forward, Time Display, Volume */}
          <div className="flex items-center justify-between text-xs sm:text-sm text-white pt-1">
            {/* Left Controls */}
            <div className="flex items-center gap-3 sm:gap-4">
              {/* Play/Pause Mini Toggle */}
              <button
                type="button"
                onClick={() => handleTogglePlay()}
                className="p-1 hover:text-hbo-cyan transition active:scale-95"
                title={isPlaying ? 'Pause' : 'Play'}
                aria-label={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? <Pause className="w-4 h-4 sm:w-5 sm:h-5 fill-current" /> : <Play className="w-4 h-4 sm:w-5 sm:h-5 fill-current" />}
              </button>

              {/* Rewind 10s Mini */}
              <button
                type="button"
                {...createSeekButtonProps(-10)}
                className="p-1 text-white/80 hover:text-hbo-cyan transition flex items-center gap-0.5 active:scale-95 select-none"
                title="Rewind 10s"
              >
                <RotateCcw className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span className="text-[10px] font-bold">-10</span>
              </button>

              {/* Forward 10s Mini */}
              <button
                type="button"
                {...createSeekButtonProps(10)}
                className="p-1 text-white/80 hover:text-hbo-cyan transition flex items-center gap-0.5 active:scale-95 select-none"
                title="Forward 10s"
              >
                <RotateCw className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span className="text-[10px] font-bold">+10</span>
              </button>

              {/* Playback Time Display */}
              <div className="font-mono text-[11px] sm:text-xs text-white/90 tracking-tight font-medium pl-1">
                <span className="text-white font-bold">{formatTime(displayCurrentTime)}</span>
                <span className="text-white/40 mx-1">/</span>
                <span className="text-white/70">{formatTime(duration)}</span>
              </div>
            </div>

            {/* Right Controls: Mute Toggle */}
            <div className="flex items-center gap-2 sm:gap-3">
              <button
                type="button"
                onClick={handleToggleMute}
                className="p-1.5 rounded-lg hover:bg-white/10 text-white/80 hover:text-white transition active:scale-95"
                title={isMuted ? 'Unmute' : 'Mute'}
                aria-label={isMuted ? 'Unmute' : 'Mute'}
              >
                {isMuted ? <VolumeX className="w-4 h-4 sm:w-5 sm:h-5 text-red-400" /> : <Volume2 className="w-4 h-4 sm:w-5 sm:h-5" />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
