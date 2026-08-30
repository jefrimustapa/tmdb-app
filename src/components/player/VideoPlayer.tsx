import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ShieldCheck, RefreshCw, AlertCircle, Maximize2, Minimize2, Zap, Tv, ArrowLeft, Play, ExternalLink, SkipForward, Radio } from 'lucide-react';
import Hls from 'hls.js';
import type { StreamProvider } from '../../types/stream';
import { STREAM_PROVIDERS, getProviderById, getOrderedProviders } from '../../services/streamProviders';
import { dbService } from '../../services/db';
import { fetchDirectStream, DEFAULT_DIRECT_STREAM_API } from '../../services/directStreamService';
import { fetchTorboxStream } from '../../services/torboxService';
import type { StreamResolverType } from '../../types/db';
import { Logo } from '../common/Logo';
import { tmdbImages, TMDB_FALLBACK_BACKDROP } from '../../services/tmdb';

interface VideoPlayerProps {
  mediaType: 'movie' | 'tv';
  tmdbId: number;
  title: string;
  posterPath: string | null;
  backdropPath: string | null;
  stillPath?: string | null;
  voteAverage?: number;
  season?: number;
  episode?: number;
  episodeTitle?: string;
  providerId: string;
  onProviderChange: (p: StreamProvider) => void;
  onProbingStatusChange?: (isProbing: boolean, currentServerIndex: number) => void;
  nextEpisodeInfo?: { season: number; episode: number; title?: string; stillPath?: string | null } | null;
  onNextEpisode?: () => void;
  initialTimestamp?: number;
  episodeRuntimeMinutes?: number;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  mediaType,
  tmdbId,
  title,
  posterPath,
  backdropPath,
  stillPath,
  voteAverage,
  season = 1,
  episode = 1,
  episodeTitle,
  providerId,
  onProviderChange,
  onProbingStatusChange,
  nextEpisodeInfo,
  onNextEpisode,
  initialTimestamp = 0,
  episodeRuntimeMinutes
}) => {
  const [iframeKey, setIframeKey] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [adShieldEnabled, setAdShieldEnabled] = useState(true);
  const [streamResolver, setStreamResolver] = useState<StreamResolverType>('embed');
  const [directStreamApiUrl, setDirectStreamApiUrl] = useState(DEFAULT_DIRECT_STREAM_API);
  const [torboxApiKey, setTorboxApiKey] = useState('');
  const [playerMode, setPlayerMode] = useState<'loading' | 'embed' | 'direct' | 'error'>('loading');
  const [directStreamUrl, setDirectStreamUrl] = useState<string | null>(null);
  const [directStreamLabel, setDirectStreamLabel] = useState<string>('');
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionFailed, setExtractionFailed] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [topProviders, setTopProviders] = useState<string[]>(['vidlink', 'moviesapi', 'cinesrc']);
  const [enabledResolvers, setEnabledResolvers] = useState<StreamResolverType[]>(['torbox', 'private_extractor', 'embed']);

  // Up Next state
  const [showUpNext, setShowUpNext] = useState(false);
  const [countdown, setCountdown] = useState(10);
  const dismissedUpNextRef = useRef(false);
  const nextEpisodeTriggeredRef = useRef(false);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Playback position memory refs (0% React re-render overhead)
  const currentTimeRef = useRef<number>(initialTimestamp || 0);
  const durationRef = useRef<number>(0);
  const hasSeekedInitialRef = useRef(false);

  // Auto-Cycle Provider until first working stream state
  const [autoCycle, setAutoCycle] = useState(true);
  const [isProbing, setIsProbing] = useState(true);
  const [triedProviders, setTriedProviders] = useState<string[]>([]);
  const [allFailed, setAllFailed] = useState(false);
  const autoCycleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const playerContainerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-hide controls helper
  const resetControlsTimer = useCallback(() => {
    setShowControls(true);
    if (controlsTimerRef.current) {
      clearTimeout(controlsTimerRef.current);
    }
    controlsTimerRef.current = setTimeout(() => {
      setShowControls(false);
    }, 3500);
  }, []);

  // Show controls on initial load or fullscreen change
  useEffect(() => {
    resetControlsTimer();
    return () => {
      if (controlsTimerRef.current) {
        clearTimeout(controlsTimerRef.current);
      }
    };
  }, [isFullscreen, resetControlsTimer]);

  const handleContainerClick = (e: React.MouseEvent) => {
    // If click was on a button or interactive element, don't toggle
    if ((e.target as HTMLElement).closest('button, a, input, select')) {
      resetControlsTimer();
      return;
    }
    if (showControls) {
      setShowControls(false);
      if (controlsTimerRef.current) {
        clearTimeout(controlsTimerRef.current);
      }
    } else {
      resetControlsTimer();
    }
  };

  // Load user settings
  useEffect(() => {
    dbService.getSettings().then((s) => {
      if (s) {
        setAdShieldEnabled(s.adBlockShield);
        try {
          (window as any).AndroidBridge?.setAdShieldEnabled?.(s.adBlockShield);
        } catch {}
        const activeResolver = s.streamResolver || (s.directStreamMode ? 'private_extractor' : 'embed');
        setStreamResolver(activeResolver);
        setEnabledResolvers(s.enabledResolvers && s.enabledResolvers.length > 0 ? s.enabledResolvers : ['torbox', 'private_extractor', 'embed']);
        if (s.directStreamApiUrl) {
          setDirectStreamApiUrl(s.directStreamApiUrl);
        }
        if (s.torboxApiKey) {
          setTorboxApiKey(s.torboxApiKey);
        }
        if (s.topProviders && s.topProviders.length >= 3) {
          setTopProviders(s.topProviders);
        }
      }
    });
  }, []);

  // Priority Stream Resolution: TorBox -> Private Extractor -> Embed Resolver
  useEffect(() => {
    let isMounted = true;
    if (!tmdbId) {
      setIsExtracting(false);
      return;
    }

    async function executeStreamResolution() {
      setIsExtracting(true);
      setPlayerMode('loading');

      // 1. Try TorBox if enabled
      if (enabledResolvers.includes('torbox') && torboxApiKey && torboxApiKey.trim()) {
        try {
          console.log('[Resolver] Checking TorBox 4K Cloud...');
          const torboxRes = await fetchTorboxStream(tmdbId, undefined, mediaType, season, episode, torboxApiKey);
          if (!isMounted) return;
          if (torboxRes && torboxRes.sources && torboxRes.sources.length > 0) {
            console.log(`[Resolver] ✅ Playing via TorBox 4K:`, torboxRes.sources[0].url);
            setDirectStreamUrl(torboxRes.sources[0].url);
            setDirectStreamLabel('TorBox 4K Cloud');
            setPlayerMode('direct');
            setIsExtracting(false);
            setExtractionFailed(false);
            setIsLoading(false);
            return;
          }
        } catch (err) {
          console.warn('[Resolver] TorBox error:', err);
        }
      }

      // 2. Try Private Consumet Extractor if enabled
      if (enabledResolvers.includes('private_extractor')) {
        try {
          console.log('[Resolver] Checking Private Stream Extractor...');
          const directRes = await fetchDirectStream(tmdbId, title, mediaType, season, episode, directStreamApiUrl);
          if (!isMounted) return;
          if (directRes && directRes.sources && directRes.sources.length > 0) {
            console.log(`[Resolver] ✅ Playing via ${directRes.provider}:`, directRes.sources[0].url);
            setDirectStreamUrl(directRes.sources[0].url);
            setDirectStreamLabel(directRes.provider);
            setPlayerMode('direct');
            setIsExtracting(false);
            setExtractionFailed(false);
            setIsLoading(false);
            return;
          }
        } catch (err) {
          console.warn('[Resolver] Private extractor error:', err);
        }
      }

      if (!isMounted) return;

      // 3. Fallback to Embed Resolver ONLY if explicitly enabled
      if (enabledResolvers.includes('embed')) {
        console.log('[Resolver] Active: Embed Resolver');
        setPlayerMode('embed');
        setDirectStreamUrl(null);
        setDirectStreamLabel('Embed Mirror');
        setIsExtracting(false);
        setExtractionFailed(false);
      } else {
        console.log('[Resolver] Direct stream not resolved and Embed Resolver is disabled.');
        setPlayerMode('error');
        setDirectStreamUrl(null);
        setExtractionFailed(true);
        setIsExtracting(false);
      }
    };

    executeStreamResolution();

    return () => {
      isMounted = false;
    };
  }, [enabledResolvers, tmdbId, title, mediaType, season, episode, directStreamApiUrl, torboxApiKey]);

  const [resumeTimestamp, setResumeTimestamp] = useState<number>(initialTimestamp || 0);

  const provider = getProviderById(providerId);
  const baseStreamUrl =
    mediaType === 'movie'
      ? provider.getMovieUrl(tmdbId)
      : provider.getTVUrl(tmdbId, season, episode);

  const streamUrl = useMemo(() => {
    if (!baseStreamUrl) return '';
    if (resumeTimestamp <= 0) return baseStreamUrl;

    const sep = baseStreamUrl.includes('?') ? '&' : '?';
    if (provider.id === 'vidlink') {
      return `${baseStreamUrl}${sep}start=${resumeTimestamp}`;
    }
    return `${baseStreamUrl}${sep}start=${resumeTimestamp}&t=${resumeTimestamp}&time=${resumeTimestamp}#t=${resumeTimestamp}`;
  }, [baseStreamUrl, resumeTimestamp, provider.id]);

  const lastSaveTimeRef = useRef<number>(0);

  // Unified progress recorder (Throttled to 10s to guarantee 0% CPU & I/O overhead on TV)
  const recordProgress = useCallback((currentSec: number, totalDurationSec: number, force = false) => {
    if ((!totalDurationSec || totalDurationSec <= 0) && episodeRuntimeMinutes) {
      totalDurationSec = episodeRuntimeMinutes * 60;
    }
    if ((!totalDurationSec || totalDurationSec <= 0) && durationRef.current > 0) {
      totalDurationSec = durationRef.current;
    }
    if (currentSec < 0) return;

    currentTimeRef.current = currentSec;
    if (totalDurationSec > 0) {
      durationRef.current = totalDurationSec;
    }

    const effectiveDuration = totalDurationSec > 0 ? totalDurationSec : durationRef.current;
    const progressPercent = effectiveDuration > 0
      ? Math.min(100, Math.round((currentSec / effectiveDuration) * 100))
      : 0;
    const now = Date.now();

    // Check for Up Next trigger on TV Series (>= 90% or within last 75 seconds)
    if (
      mediaType === 'tv' &&
      nextEpisodeInfo &&
      !showUpNext &&
      !dismissedUpNextRef.current &&
      (progressPercent >= 90 || (totalDurationSec > 120 && totalDurationSec - currentSec <= 75))
    ) {
      setShowUpNext(true);
      setCountdown(10);
      setTimeout(() => {
        const upNextBtn = document.getElementById('up-next-play-btn');
        if (upNextBtn && (window as any).__tmdbHeaderFocused !== true) {
          upNextBtn.focus();
        }
      }, 50);
    }

    // Throttled save to IndexedDB
    if (force || now - lastSaveTimeRef.current >= 10000 || progressPercent >= 95) {
      lastSaveTimeRef.current = now;
      dbService.saveWatchProgress({
        tmdbId,
        mediaType,
        title,
        posterPath,
        backdropPath,
        stillPath,
        voteAverage,
        season: mediaType === 'tv' ? season : undefined,
        episode: mediaType === 'tv' ? episode : undefined,
        episodeTitle: mediaType === 'tv' ? episodeTitle : undefined,
        timestamp: Math.round(currentSec),
        duration: Math.round(totalDurationSec),
        progressPercent
      });
    }
  }, [tmdbId, mediaType, title, posterPath, backdropPath, stillPath, voteAverage, season, episode, episodeTitle, episodeRuntimeMinutes, nextEpisodeInfo, showUpNext]);

  // Clean up media decoders and iframe resources on unmount
  useEffect(() => {
    return () => {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
      // Force save on unmount if user was watching
      if (currentTimeRef.current > 0 && durationRef.current > 0) {
        recordProgress(currentTimeRef.current, durationRef.current, true);
      }
      if (hlsRef.current) {
        try { hlsRef.current.destroy(); } catch {}
        hlsRef.current = null;
      }
      if (videoRef.current) {
        try {
          videoRef.current.pause();
          videoRef.current.removeAttribute('src');
          videoRef.current.load();
        } catch {}
      }
      const iframe = document.querySelector<HTMLIFrameElement>('iframe');
      if (iframe) {
        try { iframe.src = 'about:blank'; } catch {}
      }
    };
  }, [recordProgress]);

  // Up Next Countdown interval
  useEffect(() => {
    if (!showUpNext) {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
      return;
    }

    countdownIntervalRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          if (countdownIntervalRef.current) {
            clearInterval(countdownIntervalRef.current);
            countdownIntervalRef.current = null;
          }
          setShowUpNext(false);
          onNextEpisode?.();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
    };
  }, [showUpNext, onNextEpisode]);

  // Listen for Native Android iframe / subframe playback state changes
  useEffect(() => {
    const handlePlaybackStateChanged = (e: any) => {
      const { isPlaying, currentTime, duration } = e.detail || {};
      if (isPlaying !== undefined) {
        if (isPlaying) {
          setIsLoading(false);
          setHasError(false);
          setIsProbing(false);
          if (autoCycleTimeoutRef.current) {
            clearTimeout(autoCycleTimeoutRef.current);
            autoCycleTimeoutRef.current = null;
          }
        }
        if (duration > 0 && currentTime > 0) {
          recordProgress(currentTime, duration);
        }
      }
    };

    window.addEventListener('tmdb_playback_state_changed', handlePlaybackStateChanged);
    return () => {
      window.removeEventListener('tmdb_playback_state_changed', handlePlaybackStateChanged);
    };
  }, [recordProgress]);

  const lastPostMessageTimeRef = useRef<number>(0);

  // Listen for Cross-Origin Embed postMessage events (VidLink, PlayerJS, Plyr)
  useEffect(() => {
    const handlePostMessage = (e: MessageEvent) => {
      try {
        const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
        if (!data) return;

        // 1. VidLink PLAYER_EVENT (event: 'timeupdate' | 'pause' | 'ended' | 'time')
        if (data.type === 'PLAYER_EVENT' && data.data) {
          lastPostMessageTimeRef.current = Date.now();
          const evt = data.data.event;
          const current = data.data.currentTime ?? data.data.seconds ?? 0;
          const dur = data.data.duration ?? data.data.totalDuration ?? 0;
          if (current > 0) {
            recordProgress(current, dur, evt === 'ended');
          }
          return;
        }

        // 2. VidLink MEDIA_DATA dictionary
        if (data.type === 'MEDIA_DATA' && data.data) {
          lastPostMessageTimeRef.current = Date.now();
          const item = data.data[tmdbId];
          if (item) {
            if (mediaType === 'tv' && item.show_progress && season && episode) {
              const epKey = `s${season}e${episode}`;
              const epProgress = item.show_progress[epKey]?.progress;
              if (epProgress && epProgress.watched > 0) {
                recordProgress(epProgress.watched, epProgress.duration || 0);
              }
            } else if (item.progress && item.progress.watched > 0) {
              recordProgress(item.progress.watched, item.progress.duration || 0);
            }
          }
          return;
        }

        // 3. PlayerJS, Plyr, vidsrc, or standard event postMessages
        if (data.event === 'timeupdate' || data.event === 'progress' || data.event === 'time') {
          lastPostMessageTimeRef.current = Date.now();
          const current = data.currentTime ?? data.data?.currentTime ?? data.seconds ?? 0;
          const dur = data.duration ?? data.data?.duration ?? data.totalDuration ?? 0;
          if (current > 0) {
            recordProgress(current, dur);
          }
        }
      } catch {}
    };

    window.addEventListener('message', handlePostMessage);
    return () => window.removeEventListener('message', handlePostMessage);
  }, [recordProgress, tmdbId, mediaType, season, episode]);

  // Universal Fallback Elapsed Watch Session Ticker (For Sandboxed Embed Providers)
  useEffect(() => {
    if (playerMode !== 'embed' || hasError || allFailed) return;

    const tickerInterval = setInterval(() => {
      // If the window/document is hidden or paused in background, do not tick
      if (typeof document !== 'undefined' && document.hidden) return;

      // If we recently received real postMessage time within the last 20 seconds, defer to postMessage
      if (Date.now() - lastPostMessageTimeRef.current < 20000) return;

      // Otherwise, advance elapsed watch session time smoothly (10s increments)
      const nextTime = (currentTimeRef.current || 0) + 10;
      const fallbackDur = durationRef.current || (episodeRuntimeMinutes ? episodeRuntimeMinutes * 60 : 0);
      recordProgress(nextTime, fallbackDur);
    }, 10000);

    return () => clearInterval(tickerInterval);
  }, [playerMode, hasError, allFailed, recordProgress, episodeRuntimeMinutes]);

  // HLS Player attachment for direct streams
  useEffect(() => {
    if (playerMode === 'direct' && directStreamUrl && videoRef.current) {
      if (Hls.isSupported() && directStreamUrl.includes('.m3u8')) {
        if (hlsRef.current) {
          hlsRef.current.destroy();
        }
        const hls = new Hls({ enableWorker: true });
        hls.loadSource(directStreamUrl);
        hls.attachMedia(videoRef.current);
        hlsRef.current = hls;

        return () => {
          hls.destroy();
          hlsRef.current = null;
        };
      } else {
        videoRef.current.src = directStreamUrl;
      }
    }
  }, [playerMode, directStreamUrl]);

  // Fullscreen event listener & escape key
  useEffect(() => {
    const handleFsChange = () => {
      const isNativeFs = Boolean(
        document.fullscreenElement || (document as any).webkitFullscreenElement
      );
      if (!isNativeFs && isFullscreen) {
        setIsFullscreen(false);
        window.dispatchEvent(new CustomEvent('tmdb_fullscreen_changed', { detail: { fullscreen: false } }));
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) {
        handleExitFullscreen();
      }
    };

    document.addEventListener('fullscreenchange', handleFsChange);
    document.addEventListener('webkitfullscreenchange', handleFsChange);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('fullscreenchange', handleFsChange);
      document.removeEventListener('webkitfullscreenchange', handleFsChange);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isFullscreen]);

  // Inform Android Bridge that watch mode is active for sensor orientation
  useEffect(() => {
    try {
      (window as any).AndroidBridge?.setWatchPage?.(true);
    } catch {}

    return () => {
      try {
        (window as any).AndroidBridge?.setWatchPage?.(false);
      } catch {}
    };
  }, []);

  // Notify parent of probing status updates
  useEffect(() => {
    const currentIndex = STREAM_PROVIDERS.findIndex((p) => p.id === providerId);
    onProbingStatusChange?.(isProbing, currentIndex >= 0 ? currentIndex + 1 : 1);
  }, [isProbing, providerId, onProbingStatusChange]);

  // Initialize progress and preserve previous progress
  useEffect(() => {
    setTriedProviders([]);
    setAllFailed(false);
    setIsProbing(true);
    setIsLoading(true);
    setHasError(false);
    setShowUpNext(false);
    dismissedUpNextRef.current = false;
    nextEpisodeTriggeredRef.current = false;
    hasSeekedInitialRef.current = false;

    const initProgress = async () => {
      const existing = await dbService.getHistoryItem(tmdbId, mediaType);
      const isSameEpisode = mediaType === 'tv' ? (existing?.season === season && existing?.episode === episode) : true;
      
      const targetTimestamp = (initialTimestamp !== undefined && initialTimestamp >= 0)
        ? initialTimestamp 
        : (isSameEpisode && existing ? existing.timestamp : 0);
      
      currentTimeRef.current = targetTimestamp;
      if (targetTimestamp > 0) {
        setResumeTimestamp(targetTimestamp);
      }

      // Provisional duration from metadata
      const provisionalDuration = (episodeRuntimeMinutes ? episodeRuntimeMinutes * 60 : 0) || (existing?.duration || 0);
      durationRef.current = provisionalDuration;

      const progressPercent = provisionalDuration > 0 && targetTimestamp > 0 
        ? Math.min(100, Math.round((targetTimestamp / provisionalDuration) * 100))
        : (isSameEpisode && existing ? existing.progressPercent : 0);

      await dbService.saveWatchProgress({
        tmdbId,
        mediaType,
        title,
        posterPath,
        backdropPath,
        stillPath,
        voteAverage,
        season: mediaType === 'tv' ? season : undefined,
        episode: mediaType === 'tv' ? episode : undefined,
        episodeTitle: mediaType === 'tv' ? episodeTitle : undefined,
        timestamp: targetTimestamp,
        duration: provisionalDuration,
        progressPercent
      });
    };
    initProgress();
  }, [tmdbId, mediaType, season, episode, voteAverage, posterPath, backdropPath, stillPath, episodeTitle, episodeRuntimeMinutes, initialTimestamp]);

  const orderedProviders = React.useMemo(() => getOrderedProviders(topProviders), [topProviders]);

  const cycleToNextProvider = useCallback(() => {
    resetControlsTimer();
    const currentIndex = orderedProviders.findIndex((p) => p.id === providerId);
    const nextIndex = (currentIndex + 1) % orderedProviders.length;
    const nextProvider = orderedProviders[nextIndex];

    setTriedProviders((prev) => {
      const updated = Array.from(new Set([...prev, providerId]));
      if (updated.length >= orderedProviders.length) {
        setAllFailed(true);
        setIsProbing(false);
        setIsLoading(false);
        setHasError(true);
      } else {
        setIsLoading(true);
        setHasError(false);
        onProviderChange(nextProvider);
      }
      return updated;
    });
  }, [providerId, onProviderChange, resetControlsTimer, orderedProviders]);

  const restartAutoCycle = () => {
    setTriedProviders([]);
    setAllFailed(false);
    setIsProbing(true);
    setIsLoading(true);
    setHasError(false);
    onProviderChange(orderedProviders[0] || STREAM_PROVIDERS[0]);
  };

  // Failover watchdog timer: gives current provider 8s to establish playback, otherwise auto-cycles
  useEffect(() => {
    if (!autoCycle || !isProbing || allFailed || playerMode !== 'embed') return;

    if (autoCycleTimeoutRef.current) {
      clearTimeout(autoCycleTimeoutRef.current);
    }

    autoCycleTimeoutRef.current = setTimeout(() => {
      console.warn(`[AutoCycle] Server ${providerId} did not respond in 8s. Auto-cycling to next server...`);
      cycleToNextProvider();
    }, 8000);

    return () => {
      if (autoCycleTimeoutRef.current) {
        clearTimeout(autoCycleTimeoutRef.current);
      }
    };
  }, [providerId, autoCycle, isProbing, allFailed, playerMode, cycleToNextProvider, iframeKey]);

  const handleIframeLoaded = () => {
    if (autoCycleTimeoutRef.current) {
      clearTimeout(autoCycleTimeoutRef.current);
    }
    setIsLoading(false);
    setIsProbing(false);
    setHasError(false);

    // Active un-muting routine across embedded video players (VidLink, VidSrc, Plyr, JWPlayer, Video.js)
    const sendUnmuteMessages = () => {
      const iframe = playerContainerRef.current?.querySelector('iframe');
      if (iframe) {
        // Move focus into the iframe ONLY if the user is not actively navigating the header or provider picker
        const header = document.querySelector('[data-watch-header="true"]');
        const isHeaderFocused = Boolean(header && header.contains(document.activeElement));
        const isDropdownOpen = Boolean(document.querySelector('[data-provider-dropdown-open="true"]'));
        if (!isHeaderFocused && !isDropdownOpen) {
          try {
            iframe.focus();
          } catch {}
        }

        if (iframe.contentWindow) {
          try {
            // Standard postMessage command schemas used by embedded video players
            iframe.contentWindow.postMessage({ type: 'unmute' }, '*');
            iframe.contentWindow.postMessage({ event: 'command', func: 'unMute', args: '' }, '*');
            iframe.contentWindow.postMessage({ event: 'command', func: 'setVolume', args: [100] }, '*');
            iframe.contentWindow.postMessage({ action: 'unmute' }, '*');
            iframe.contentWindow.postMessage({ method: 'setVolume', value: 1 }, '*');
            iframe.contentWindow.postMessage({ method: 'setMuted', value: false }, '*');
            iframe.contentWindow.postMessage({ api: 'player', command: 'unmute' }, '*');
            iframe.contentWindow.postMessage({ api: 'player', command: 'setVolume', args: [1] }, '*');
            iframe.contentWindow.postMessage(JSON.stringify({ event: 'command', func: 'unMute' }), '*');
            iframe.contentWindow.postMessage(JSON.stringify({ event: 'command', func: 'setVolume', args: [100] }), '*');
            iframe.contentWindow.postMessage(JSON.stringify({ type: 'unmute' }), '*');
            iframe.contentWindow.postMessage(JSON.stringify({ method: 'setMuted', value: false }), '*');
            iframe.contentWindow.postMessage(JSON.stringify({ method: 'setVolume', value: 1 }), '*');

            if (resumeTimestamp > 0) {
              iframe.contentWindow.postMessage({ type: 'SEEK', data: { time: resumeTimestamp } }, '*');
              iframe.contentWindow.postMessage({ event: 'seek', time: resumeTimestamp }, '*');
              iframe.contentWindow.postMessage({ type: 'seek', time: resumeTimestamp }, '*');
              iframe.contentWindow.postMessage(JSON.stringify({ type: 'seek', time: resumeTimestamp }), '*');
              iframe.contentWindow.postMessage(JSON.stringify({ event: 'command', func: 'seekTo', args: [resumeTimestamp, true] }), '*');
            }
          } catch {
            // ignore cross-origin postMessage restrictions
          }
        }
      }
    };

    // On Android TV and Touch devices, simulate center touch to activate iframe player & play button immediately
    const activateCenterPlayButton = () => {
      try {
        if (typeof (window as any).AndroidBridge?.simulateTouchAt === 'function') {
          const cx = window.innerWidth / 2;
          const cy = window.innerHeight / 2;
          (window as any).AndroidBridge.simulateTouchAt(cx, cy);
        }
      } catch {}
    };

    // Attempt immediately, and retry at 500ms, 1200ms, 2500ms, and 4000ms once media buffer begins
    sendUnmuteMessages();
    setTimeout(() => {
      sendUnmuteMessages();
      activateCenterPlayButton();
    }, 600);
    setTimeout(sendUnmuteMessages, 1200);
    setTimeout(sendUnmuteMessages, 2500);
    setTimeout(sendUnmuteMessages, 4000);
  };

  const handleIframeError = () => {
    if (autoCycleTimeoutRef.current) {
      clearTimeout(autoCycleTimeoutRef.current);
    }
    setIsLoading(false);
    if (autoCycle && !allFailed) {
      cycleToNextProvider();
    } else {
      setHasError(true);
    }
  };

  const handleRefresh = () => {
    resetControlsTimer();
    if (playerMode === 'direct') {
      setIsExtracting(true);
      setExtractionFailed(false);
      setTimeout(() => {
        setIsExtracting(false);
        setExtractionFailed(true);
      }, 1500);
    } else {
      setIsLoading(true);
      setIframeKey((prev) => prev + 1);
    }
  };

  const handleEnterFullscreen = async () => {
    setIsFullscreen(true);
    resetControlsTimer();
    window.dispatchEvent(new CustomEvent('tmdb_fullscreen_changed', { detail: { fullscreen: true } }));

    // Call native Android bridge to hide system bars and rotate to landscape
    try {
      (window as any).AndroidBridge?.setFullscreen(true);
    } catch {
      // ignore
    }

    // 1. Try native HTML5 requestFullscreen
    try {
      const elem = playerContainerRef.current;
      if (elem?.requestFullscreen) {
        await elem.requestFullscreen();
      } else if ((elem as any)?.webkitRequestFullscreen) {
        await (elem as any).webkitRequestFullscreen();
      }
    } catch {
      // CSS fullscreen provides a fallback
    }

    // 2. Try locking orientation to landscape on mobile devices
    try {
      if (screen.orientation && (screen.orientation as any).lock) {
        await (screen.orientation as any).lock('landscape');
      }
    } catch {
      // Ignore unsupported orientation locks
    }
  };

  const handleExitFullscreen = async () => {
    setIsFullscreen(false);
    resetControlsTimer();
    window.dispatchEvent(new CustomEvent('tmdb_fullscreen_changed', { detail: { fullscreen: false } }));

    // Call native Android bridge to restore system bars and auto orientation
    try {
      (window as any).AndroidBridge?.setFullscreen(false);
    } catch {
      // ignore
    }

    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else if ((document as any).webkitFullscreenElement) {
        await (document as any).webkitExitFullscreen();
      }
    } catch {
      // Ignore exit error
    }

    try {
      if (screen.orientation && (screen.orientation as any).unlock) {
        (screen.orientation as any).unlock();
      }
    } catch {
      // Ignore orientation unlock error
    }
  };

  const handleToggleFullscreen = () => {
    if (isFullscreen) {
      handleExitFullscreen();
    } else {
      handleEnterFullscreen();
    }
  };

  return (
    <div
      ref={playerContainerRef}
      onClick={handleContainerClick}
      onMouseMove={resetControlsTimer}
      onTouchStart={resetControlsTimer}
      className={`relative overflow-hidden bg-black transition-all duration-300 select-none ${
        isFullscreen
          ? 'fixed inset-0 z-[999999] w-screen h-screen m-0 p-0 rounded-none border-0'
          : 'w-full h-full border-0 rounded-none'
      }`}
    >
      {/* STATE 1: Resolving Stream Loading Screen */}
      {playerMode === 'loading' && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black">
          <div className="w-12 h-12 border-4 border-hbo-purple-light border-t-hbo-cyan rounded-full animate-spin mb-4 shadow-hbo-glow" />
          <p className="text-sm font-bold text-white tracking-wide">
            Resolving Stream...
          </p>
          <p className="text-xs text-gray-400 mt-1.5">
            Checking: {enabledResolvers.map(r => r === 'torbox' ? 'TorBox 4K' : r === 'private_extractor' ? 'Private Extractor' : 'Embed Resolver').join(' → ')}
          </p>
        </div>
      )}

      {/* STATE 2: Embed Provider Loading Spinner */}
      {playerMode === 'embed' && isLoading && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/90 backdrop-blur-md">
          <div className="w-12 h-12 border-4 border-hbo-purple-light border-t-hbo-cyan rounded-full animate-spin mb-3 shadow-hbo-glow" />
          <p className="text-sm font-semibold text-gray-200">
            Loading stream via <span className="text-hbo-cyan font-bold">{provider.name}</span>...
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {adShieldEnabled ? 'Ad & Popup Shield is active' : 'Ad Shield disabled (Unrestricted mode)'}
          </p>
        </div>
      )}

      {/* STATE 3: Native Direct Player Mode */}
      {playerMode === 'direct' && directStreamUrl && (
        <video
          ref={videoRef}
          controls={showControls}
          autoPlay
          playsInline
          muted={false}
          className="w-full h-full object-contain bg-black transform-gpu will-change-transform"
          onLoadedData={() => setIsLoading(false)}
          onLoadedMetadata={(e) => {
            const el = e.currentTarget;
            if (el.duration > 0) {
              durationRef.current = el.duration;
            }
            if (currentTimeRef.current > 10 && !hasSeekedInitialRef.current) {
              hasSeekedInitialRef.current = true;
              try {
                el.currentTime = currentTimeRef.current;
              } catch {}
            }
          }}
          onTimeUpdate={(e) => {
            const el = e.currentTarget;
            recordProgress(el.currentTime, el.duration);
          }}
          onPause={(e) => {
            const el = e.currentTarget;
            recordProgress(el.currentTime, el.duration, true);
          }}
          onEnded={() => {
            if (durationRef.current > 0) {
              recordProgress(durationRef.current, durationRef.current, true);
            }
            if (mediaType === 'tv' && nextEpisodeInfo) {
              setShowUpNext(true);
              setCountdown(10);
              setTimeout(() => {
                const upNextBtn = document.getElementById('up-next-play-btn');
                if (upNextBtn && (window as any).__tmdbHeaderFocused !== true) {
                  upNextBtn.focus();
                }
              }, 50);
            }
          }}
          onError={() => {
            if (enabledResolvers.includes('embed')) {
              console.log('[DirectStream] Playback error on direct stream. Fallback to embed.');
              setPlayerMode('embed');
            } else {
              console.log('[DirectStream] Playback error on direct stream. Embed is disabled.');
              setPlayerMode('error');
            }
            setDirectStreamUrl(null);
          }}
        />
      )}

      {/* STATE 4: Protected Video Embed (ONLY rendered if embed is enabled) */}
      {playerMode === 'embed' && enabledResolvers.includes('embed') && (
        <iframe
          key={`${streamUrl}-${iframeKey}-${adShieldEnabled}`}
          src={streamUrl}
          title={title}
          loading="eager"
          className="w-full h-full border-0 transform-gpu will-change-transform"
          allowFullScreen
          allow="autoplay *; encrypted-media *; picture-in-picture *; fullscreen *"
          sandbox={
            (typeof (window as any).AndroidBridge !== 'undefined')
              ? undefined
              : (adShieldEnabled
                ? 'allow-scripts allow-same-origin allow-forms allow-presentation allow-pointer-lock'
                : undefined)
          }
          onLoad={handleIframeLoaded}
          onError={handleIframeError}
        />
      )}

      {/* STATE 5: Direct Stream Not Resolved Error (Embed Disabled) */}
      {playerMode === 'error' && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/95 backdrop-blur-md p-6 text-center animate-fade-in">
          <div className="mb-4">
            <Logo size="lg" showText={true} />
          </div>
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-400 text-xs font-bold mb-3">
            <AlertCircle className="w-4 h-4" />
            <span>Direct Stream Unavailable</span>
          </div>
          <h3 className="text-lg sm:text-xl font-black font-display text-white mb-2 tracking-tight">
            Could Not Resolve Direct Stream
          </h3>
          <p className="text-xs sm:text-sm text-gray-400 max-w-md mb-6 leading-relaxed">
            The active direct stream engines (<span className="text-white font-semibold">{enabledResolvers.map(r => r === 'torbox' ? 'TorBox 4K' : 'Private Extractor').join(', ')}</span>) did not return a working direct video stream for "<span className="text-white">{title}</span>".
            <br /><br />
            <span className="text-gray-300">Embed Resolver is currently disabled in your Settings.</span>
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={() => window.location.href = '/settings'}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-hbo-purple to-hbo-cyan text-white font-bold text-xs sm:text-sm shadow-hbo-glow hover:scale-105 transition tv-focus-target"
            >
              Open Settings to Enable Embed Resolver
            </button>
          </div>
        </div>
      )}

      {/* Fallback Error Overlay */}
      {hasError && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/95 backdrop-blur-md p-6 text-center animate-fade-in">
          <div className="mb-4">
            <Logo size="lg" showText={true} />
          </div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-500/20 border border-red-500/40 text-red-400 text-xs font-bold mb-3">
            <AlertCircle className="w-4 h-4" />
            <span>{allFailed ? 'All Stream Servers Attempted' : 'Server Stream Unavailable'}</span>
          </div>
          <h3 className="text-lg sm:text-xl font-black font-display text-white mb-2 tracking-tight">
            Unable to Load Video Stream
          </h3>
          <p className="text-xs sm:text-sm text-gray-400 max-w-md mb-6 leading-relaxed">
            {allFailed
              ? `We tested all ${STREAM_PROVIDERS.length} streaming servers, but none responded with an active video feed for this title right now.`
              : `The selected server (${provider.name}) could not stream "${title}". Please try switching to another server.`}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={restartAutoCycle}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-hbo-purple to-hbo-cyan text-white font-bold text-xs sm:text-sm shadow-hbo-glow hover:scale-105 transition tv-focus-target"
            >
              Restart Auto-Cycle (All Servers)
            </button>
            <button
              onClick={cycleToNextProvider}
              className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs sm:text-sm font-semibold border border-white/20 transition hover:scale-105 tv-focus-target"
            >
              Try Next Server
            </button>
          </div>
        </div>
      )}

      {/* Up Next Episode Overlay (Appears at >= 90% or episode end) */}
      {showUpNext && nextEpisodeInfo && (
        <div className="absolute bottom-6 right-6 z-40 max-w-sm sm:max-w-md w-full bg-hbo-card/95 border border-hbo-cyan/40 rounded-2xl shadow-2xl p-4 backdrop-blur-xl animate-in fade-in slide-in-from-bottom-5 duration-300 transform-gpu">
          <div className="flex items-center justify-between gap-2 mb-2.5">
            <span className="text-[11px] font-black uppercase tracking-wider text-hbo-cyan flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-hbo-cyan animate-pulse" />
              Up Next in {countdown}s
            </span>
            <button
              onClick={() => {
                setShowUpNext(false);
                dismissedUpNextRef.current = true;
              }}
              className="p-1 text-gray-400 hover:text-white rounded-lg transition"
              title="Dismiss"
              aria-label="Dismiss"
            >
              <Minimize2 className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center gap-3">
            <div className="w-24 aspect-video rounded-lg overflow-hidden bg-gray-900 flex-shrink-0 border border-white/10 relative">
              <img
                src={nextEpisodeInfo.stillPath ? tmdbImages.still(nextEpisodeInfo.stillPath, 'w300') : (backdropPath ? tmdbImages.backdrop(backdropPath, 'w300') : TMDB_FALLBACK_BACKDROP)}
                alt={nextEpisodeInfo.title || 'Next Episode'}
                className="w-full h-full object-cover"
                loading="lazy"
                decoding="async"
              />
              <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                <Play className="w-5 h-5 fill-white text-white opacity-90" />
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-hbo-purple-light font-bold">
                Season {nextEpisodeInfo.season} • Episode {nextEpisodeInfo.episode}
              </p>
              <h4 className="text-sm font-bold text-white truncate mt-0.5">
                {nextEpisodeInfo.title || `Episode ${nextEpisodeInfo.episode}`}
              </h4>
            </div>
          </div>

          {/* Action Buttons & Countdown Bar */}
          <div className="mt-3.5 space-y-2">
            <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-hbo-purple-light to-hbo-cyan transition-all duration-1000 ease-linear"
                style={{ width: `${(countdown / 10) * 100}%` }}
              />
            </div>
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setShowUpNext(false);
                  dismissedUpNextRef.current = true;
                }}
                className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition tv-focus-target"
              >
                Dismiss
              </button>
              <button
                id="up-next-play-btn"
                type="button"
                onClick={() => {
                  setShowUpNext(false);
                  onNextEpisode?.();
                }}
                className="px-4 py-1.5 rounded-xl bg-gradient-to-r from-hbo-purple to-hbo-cyan text-white text-xs font-bold shadow-hbo-glow hover:scale-105 transition flex items-center gap-1.5 tv-focus-target"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                Play Now
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
