import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ShieldCheck, RefreshCw, AlertCircle, Maximize2, Minimize2, Zap, Tv, ArrowLeft, Play, ExternalLink, SkipForward, Radio } from 'lucide-react';
import Hls from 'hls.js';
import type { StreamProvider } from '../../types/stream';
import { STREAM_PROVIDERS, getProviderById } from '../../services/streamProviders';
import { dbService } from '../../services/db';
import { Logo } from '../common/Logo';
import { tmdbImages } from '../../services/tmdb';

interface VideoPlayerProps {
  mediaType: 'movie' | 'tv';
  tmdbId: number;
  title: string;
  posterPath: string | null;
  backdropPath: string | null;
  voteAverage?: number;
  season?: number;
  episode?: number;
  episodeTitle?: string;
  providerId: string;
  onProviderChange: (p: StreamProvider) => void;
  onProbingStatusChange?: (isProbing: boolean, currentServerIndex: number) => void;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  mediaType,
  tmdbId,
  title,
  posterPath,
  backdropPath,
  voteAverage,
  season = 1,
  episode = 1,
  episodeTitle,
  providerId,
  onProviderChange,
  onProbingStatusChange
}) => {
  const [iframeKey, setIframeKey] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [adShieldEnabled, setAdShieldEnabled] = useState(true);
  const [directStreamMode, setDirectStreamMode] = useState(false);
  const [playerMode, setPlayerMode] = useState<'embed' | 'direct'>('embed');
  const [directStreamUrl, setDirectStreamUrl] = useState<string | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionFailed, setExtractionFailed] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);

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
        setDirectStreamMode(s.directStreamMode || false);
      }
    });
  }, []);

  const provider = getProviderById(providerId);
  const streamUrl =
    mediaType === 'movie'
      ? provider.getMovieUrl(tmdbId)
      : provider.getTVUrl(tmdbId, season, episode);

  // Direct stream extractor effect & Native Android Stream Sniffer Interception
  useEffect(() => {
    const handleDirectStreamFound = (e: any) => {
      const url = e.detail?.streamUrl;
      // Only auto-switch if the user explicitly enabled "Direct Stream Extractor" in Settings
      if (url && (directStreamMode || playerMode === 'direct')) {
        console.log('[NativeStreamSniffer] Captured direct stream:', url);
        setDirectStreamUrl(url);
        setPlayerMode('direct');
        setIsExtracting(false);
        setExtractionFailed(false);
        setIsLoading(false);
      }
    };

    window.addEventListener('tmdb_direct_stream_found', handleDirectStreamFound);

    return () => {
      window.removeEventListener('tmdb_direct_stream_found', handleDirectStreamFound);
    };
  }, [directStreamMode, playerMode]);

  // Listen for Native Android iframe / subframe playback state changes
  useEffect(() => {
    const handlePlaybackStateChanged = (e: any) => {
      const { isPlaying, currentTime, duration } = e.detail || {};
      if (isPlaying !== undefined) {
        if (isPlaying) {
          setIsLoading(false);
          setHasError(false);
        }
        // If currentTime and duration are available from the media stream, record progress
        if (duration > 0 && currentTime > 0) {
          const progressPercent = Math.min(100, Math.round((currentTime / duration) * 100));
          dbService.saveWatchProgress({
            tmdbId,
            mediaType,
            title,
            posterPath,
            backdropPath,
            voteAverage,
            season: mediaType === 'tv' ? season : undefined,
            episode: mediaType === 'tv' ? episode : undefined,
            episodeTitle: mediaType === 'tv' ? episodeTitle : undefined,
            timestamp: Math.round(currentTime),
            duration: Math.round(duration),
            progressPercent
          });
        }
      }
    };

    window.addEventListener('tmdb_playback_state_changed', handlePlaybackStateChanged);
    return () => {
      window.removeEventListener('tmdb_playback_state_changed', handlePlaybackStateChanged);
    };
  }, [tmdbId, mediaType, title, posterPath, backdropPath, voteAverage, season, episode, episodeTitle]);

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

  // Save progress when user starts streaming & reset probe for new media
  useEffect(() => {
    setTriedProviders([]);
    setAllFailed(false);
    setIsProbing(true);
    setIsLoading(true);
    setHasError(false);

    const saveProgress = async () => {
      await dbService.saveWatchProgress({
        tmdbId,
        mediaType,
        title,
        posterPath,
        backdropPath,
        voteAverage,
        season: mediaType === 'tv' ? season : undefined,
        episode: mediaType === 'tv' ? episode : undefined,
        episodeTitle: mediaType === 'tv' ? episodeTitle : undefined,
        timestamp: 0,
        duration: 0,
        progressPercent: 0
      });
    };
    saveProgress();
  }, [tmdbId, mediaType, season, episode, voteAverage]);

  const cycleToNextProvider = useCallback(() => {
    resetControlsTimer();
    const currentIndex = STREAM_PROVIDERS.findIndex((p) => p.id === providerId);
    const nextIndex = (currentIndex + 1) % STREAM_PROVIDERS.length;
    const nextProvider = STREAM_PROVIDERS[nextIndex];

    setTriedProviders((prev) => {
      const updated = Array.from(new Set([...prev, providerId]));
      if (updated.length >= STREAM_PROVIDERS.length) {
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
  }, [providerId, onProviderChange, resetControlsTimer]);

  const restartAutoCycle = () => {
    setTriedProviders([]);
    setAllFailed(false);
    setIsProbing(true);
    setIsLoading(true);
    setHasError(false);
    onProviderChange(STREAM_PROVIDERS[0]);
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
        // Move focus directly into the media player iframe so D-Pad and Center Play button are immediately active
        try {
          iframe.focus();
        } catch {}

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
      {/* Loading Spinner for Embed mode */}
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

      {/* MODE A: Native Direct Player Mode */}
      {playerMode === 'direct' ? (
        directStreamUrl ? (
          <video
            ref={videoRef}
            controls={showControls}
            autoPlay
            playsInline
            muted={false}
            className="w-full h-full object-contain bg-black"
            onLoadedData={() => setIsLoading(false)}
            onError={() => {
              console.log('[DirectStream] Playback error on direct stream. Immediate fallback to embed.');
              setPlayerMode('embed');
              setDirectStreamUrl(null);
            }}
          />
        ) : (
          /* Immediate silent fallback to embed if direct stream URL is not present */
          (() => {
            setPlayerMode('embed');
            return null;
          })()
        )
      ) : (
        /* MODE B: Protected Video Embed with Popup & Redirect Shield */
        <iframe
          key={`${streamUrl}-${iframeKey}-${adShieldEnabled}`}
          src={streamUrl}
          title={title}
          className="w-full h-full border-0"
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
    </div>
  );
};
