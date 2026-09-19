import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  Zap,
  Sparkles,
  Loader2,
  Film
} from 'lucide-react';
import Hls from 'hls.js';
import { tmdbImages, TMDB_FALLBACK_BACKDROP } from '../../services/tmdb';

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
  onProgress?: (currentTime: number, duration: number, isPaused?: boolean) => void;
  onEnded?: () => void;
  onError?: (err: any) => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
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
  onProgress,
  onEnded,
  onError,
  isFullscreen,
  onToggleFullscreen,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTapRef = useRef<{ time: number; x: number }>({ time: 0, x: 0 });

  // Playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(initialTimestamp || 0);
  const [duration, setDuration] = useState(0);
  const [bufferedPercent, setBufferedPercent] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);

  // Loading & Buffering states
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isBuffering, setIsBuffering] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState('Connecting to stream server...');

  // UI state
  const [showControls, setShowControls] = useState(true);
  const [isDraggingScrubber, setIsDraggingScrubber] = useState(false);
  const [scrubPreviewTime, setScrubPreviewTime] = useState<number | null>(null);
  const [doubleTapFeedback, setDoubleTapFeedback] = useState<'rwd' | 'fwd' | null>(null);

  const hasSeekedInitialRef = useRef(false);

  // Auto-hide controls helper
  const resetControlsTimer = useCallback(() => {
    setShowControls(true);
    if (controlsTimerRef.current) {
      clearTimeout(controlsTimerRef.current);
    }
    // Only auto-hide if playing and not actively dragging scrubber
    if (!isDraggingScrubber) {
      controlsTimerRef.current = setTimeout(() => {
        setShowControls(false);
      }, 3500);
    }
  }, [isDraggingScrubber]);

  // Loading status messages progression
  useEffect(() => {
    if (!isInitialLoading) return;
    const t1 = setTimeout(() => setLoadingStatus('Connecting to direct stream...'), 1500);
    const t2 = setTimeout(() => setLoadingStatus('Buffering high-speed video...'), 4500);
    const t3 = setTimeout(() => setLoadingStatus('Preparing playback...'), 9000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [isInitialLoading]);

  // Video Source Attachment (HLS or Native MP4/MKV)
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    setIsInitialLoading(true);
    setIsBuffering(false);
    hasSeekedInitialRef.current = false;

    if (Hls.isSupported() && src.includes('.m3u8')) {
      if (hlsRef.current) {
        hlsRef.current.destroy();
      }

      const hls = new Hls({
        enableWorker: false,
        lowLatencyMode: false,
        backBufferLength: 90,
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
              onError?.(data);
              break;
          }
        }
      });

      hls.loadSource(src);
      hls.attachMedia(video);
      hlsRef.current = hls;

      return () => {
        hls.destroy();
        hlsRef.current = null;
      };
    } else {
      // Direct stream URL (MP4 / MKV from MSM32)
      video.src = src;
      video.load();
    }
  }, [src, onError]);

  // Handle Play/Pause
  const handleTogglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    if (video.paused) {
      video.play().catch(console.warn);
      setIsPlaying(true);
    } else {
      video.pause();
      setIsPlaying(false);
    }
    resetControlsTimer();
  }, [resetControlsTimer]);

  // Handle Relative Seek (+10s or -10s)
  const handleSeekRelative = useCallback((seconds: number) => {
    const video = videoRef.current;
    if (!video) return;

    const newTime = Math.max(0, Math.min(video.duration || 0, video.currentTime + seconds));
    video.currentTime = newTime;
    setCurrentTime(newTime);
    onProgress?.(newTime, video.duration || 0, video.paused);

    // Trigger feedback animation
    setDoubleTapFeedback(seconds > 0 ? 'fwd' : 'rwd');
    setTimeout(() => setDoubleTapFeedback(null), 600);

    resetControlsTimer();
  }, [onProgress, resetControlsTimer]);

  // Handle Double Tap on Video Screen
  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    const now = Date.now();
    const touch = e.touches[0];
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const tapX = touch.clientX - rect.left;
    const width = rect.width;
    const timeDiff = now - lastTapRef.current.time;

    if (timeDiff < 300) {
      // Double tap detected
      if (tapX < width * 0.35) {
        // Left side -> Rewind 10s
        handleSeekRelative(-10);
      } else if (tapX > width * 0.65) {
        // Right side -> Forward 10s
        handleSeekRelative(10);
      } else {
        // Center -> Play/Pause
        handleTogglePlay();
      }
      lastTapRef.current = { time: 0, x: 0 };
    } else {
      lastTapRef.current = { time: now, x: tapX };
      resetControlsTimer();
    }
  };

  // Scrubber dragging
  const handleScrubberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(e.target.value);
    setScrubPreviewTime(newTime);
    setCurrentTime(newTime);
  };

  const handleScrubberCommit = () => {
    if (videoRef.current && scrubPreviewTime !== null) {
      videoRef.current.currentTime = scrubPreviewTime;
      setCurrentTime(scrubPreviewTime);
      onProgress?.(scrubPreviewTime, videoRef.current.duration || 0, videoRef.current.paused);
    }
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

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) return;

      switch (e.code) {
        case 'Space':
        case 'KeyK':
          e.preventDefault();
          handleTogglePlay();
          break;
        case 'ArrowLeft':
        case 'KeyJ':
          e.preventDefault();
          handleSeekRelative(-10);
          break;
        case 'ArrowRight':
        case 'KeyL':
          e.preventDefault();
          handleSeekRelative(10);
          break;
        case 'KeyM':
          e.preventDefault();
          handleToggleMute();
          break;
        case 'KeyF':
          e.preventDefault();
          onToggleFullscreen();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleTogglePlay, handleSeekRelative, onToggleFullscreen]);

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

  const playedPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-black select-none overflow-hidden group"
      onMouseMove={resetControlsTimer}
      onTouchStart={handleTouchStart}
      onClick={(e) => {
        // Toggle controls if clicking on empty player space
        if ((e.target as HTMLElement).closest('button, input')) return;
        setShowControls((prev) => !prev);
      }}
    >
      {/* HTML5 Video Element (controls disabled to eradicate native Android WebView placeholder) */}
      <video
        ref={videoRef}
        controls={false}
        autoPlay
        playsInline
        muted={isMuted}
        className="w-full h-full object-contain bg-black transform-gpu will-change-transform"
        onLoadedMetadata={(e) => {
          const el = e.currentTarget;
          if (el.duration > 0) {
            setDuration(el.duration);
          }
          if (initialTimestamp > 10 && !hasSeekedInitialRef.current) {
            hasSeekedInitialRef.current = true;
            try {
              el.currentTime = initialTimestamp;
            } catch {}
          }
        }}
        onCanPlay={() => {
          setIsInitialLoading(false);
          setIsBuffering(false);
        }}
        onLoadedData={() => {
          setIsInitialLoading(false);
          setIsBuffering(false);
        }}
        onWaiting={() => setIsBuffering(true)}
        onPlaying={() => {
          setIsInitialLoading(false);
          setIsBuffering(false);
          setIsPlaying(true);
        }}
        onPause={(e) => {
          setIsPlaying(false);
          onProgress?.(e.currentTarget.currentTime, e.currentTarget.duration, true);
        }}
        onTimeUpdate={(e) => {
          const el = e.currentTarget;
          if (!isDraggingScrubber) {
            setCurrentTime(el.currentTime);
          }
          // Compute buffered percentage
          if (el.buffered.length > 0) {
            const bufferedEnd = el.buffered.end(el.buffered.length - 1);
            if (el.duration > 0) {
              setBufferedPercent((bufferedEnd / el.duration) * 100);
            }
          }
          onProgress?.(el.currentTime, el.duration, el.paused);
        }}
        onEnded={() => {
          setIsPlaying(false);
          onEnded?.();
        }}
        onError={(e) => {
          console.error('[CustomDirectPlayer] Video error:', e);
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

            {/* Glowing Spinner */}
            <div className="relative mb-3">
              <div className="w-14 h-14 border-4 border-hbo-purple/30 border-t-hbo-cyan border-r-hbo-purple rounded-full animate-spin shadow-hbo-glow" />
              <div className="absolute inset-0 flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-hbo-cyan animate-pulse" />
              </div>
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

            {/* Live Progress Ticker */}
            <p className="text-xs text-gray-300 font-medium tracking-wide animate-pulse">
              {loadingStatus}
            </p>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MID-STREAM BUFFERING SPINNER                                              */}
      {/* ========================================================================= */}
      {isBuffering && !isInitialLoading && (
        <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none bg-black/40 backdrop-blur-sm animate-fade-in">
          <div className="w-16 h-16 border-4 border-white/20 border-t-hbo-cyan rounded-full animate-spin shadow-hbo-glow" />
        </div>
      )}

      {/* ========================================================================= */}
      {/* DOUBLE-TAP SEEK FEEDBACK RIPPLES (+10s / -10s)                           */}
      {/* ========================================================================= */}
      {doubleTapFeedback === 'rwd' && (
        <div className="absolute left-10 top-1/2 -translate-y-1/2 z-25 flex flex-col items-center justify-center p-4 rounded-full bg-black/70 border border-white/20 text-white animate-fade-in pointer-events-none shadow-2xl">
          <RotateCcw className="w-8 h-8 text-hbo-cyan animate-spin" />
          <span className="text-xs font-black mt-1 text-hbo-cyan">-10s</span>
        </div>
      )}
      {doubleTapFeedback === 'fwd' && (
        <div className="absolute right-10 top-1/2 -translate-y-1/2 z-25 flex flex-col items-center justify-center p-4 rounded-full bg-black/70 border border-white/20 text-white animate-fade-in pointer-events-none shadow-2xl">
          <RotateCw className="w-8 h-8 text-hbo-cyan animate-spin" />
          <span className="text-xs font-black mt-1 text-hbo-cyan">+10s</span>
        </div>
      )}

      {/* ========================================================================= */}
      {/* HTML5 CUSTOM CONTROLS OVERLAY (PLAY, FWD, RWD, SCRUBBER, THEME MATCHED)   */}
      {/* ========================================================================= */}
      <div
        className={`absolute inset-0 z-20 flex flex-col justify-between p-4 sm:p-6 transition-opacity duration-300 pointer-events-none ${
          showControls && !isInitialLoading ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {/* Top Floating Bar: Title, Episode & Stream Quality Badge */}
        <div className="flex items-center justify-between w-full pointer-events-auto">
          <div className="flex items-center gap-2 max-w-[80%]">
            <div className="p-1.5 rounded-lg bg-black/60 border border-white/10 backdrop-blur-md">
              <Film className="w-4 h-4 text-hbo-cyan" />
            </div>
            <div className="min-w-0">
              <h4 className="text-xs sm:text-sm font-bold text-white truncate drop-shadow-md">
                {title}
              </h4>
              {mediaType === 'tv' && (
                <p className="text-[11px] text-hbo-purple-light font-semibold truncate drop-shadow-sm">
                  S{season} E{episode} {episodeTitle ? `• ${episodeTitle}` : ''}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 rounded-full bg-black/60 border border-hbo-cyan/30 text-hbo-cyan text-[10px] sm:text-xs font-bold backdrop-blur-md flex items-center gap-1 shadow-sm">
              <Zap className="w-3 h-3" />
              Direct 1080p
            </span>
          </div>
        </div>

        {/* Center Action Controls: Rewind 10s, Glowing Play/Pause, Forward 10s */}
        <div className="flex items-center justify-center gap-6 sm:gap-8 my-auto pointer-events-auto">
          {/* Rewind 10s Button */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleSeekRelative(-10);
            }}
            title="Rewind 10s"
            aria-label="Rewind 10 seconds"
            className="relative p-3 sm:p-3.5 rounded-full bg-black/60 hover:bg-black/85 text-white/90 hover:text-white border border-white/15 hover:border-hbo-cyan hover:scale-110 active:scale-95 transition-all shadow-lg backdrop-blur-md flex items-center justify-center group"
          >
            <RotateCcw className="w-6 h-6 sm:w-7 sm:h-7 text-white group-hover:text-hbo-cyan transition" />
            <span className="absolute text-[9px] sm:text-[10px] font-black text-white/90 group-hover:text-hbo-cyan">
              10
            </span>
          </button>

          {/* Main Play / Pause Button with HBO Gradient & Glow */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleTogglePlay();
            }}
            title={isPlaying ? 'Pause' : 'Play'}
            aria-label={isPlaying ? 'Pause' : 'Play'}
            className="p-4 sm:p-5 rounded-full bg-gradient-to-r from-hbo-purple to-hbo-cyan text-white shadow-hbo-glow hover:scale-110 active:scale-95 transition-all flex items-center justify-center border border-white/30"
          >
            {isPlaying ? (
              <Pause className="w-7 h-7 sm:w-9 sm:h-9 fill-current" />
            ) : (
              <Play className="w-7 h-7 sm:w-9 sm:h-9 fill-current translate-x-0.5" />
            )}
          </button>

          {/* Forward 10s Button */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleSeekRelative(10);
            }}
            title="Forward 10s"
            aria-label="Forward 10 seconds"
            className="relative p-3 sm:p-3.5 rounded-full bg-black/60 hover:bg-black/85 text-white/90 hover:text-white border border-white/15 hover:border-hbo-cyan hover:scale-110 active:scale-95 transition-all shadow-lg backdrop-blur-md flex items-center justify-center group"
          >
            <RotateCw className="w-6 h-6 sm:w-7 sm:h-7 text-white group-hover:text-hbo-cyan transition" />
            <span className="absolute text-[9px] sm:text-[10px] font-black text-white/90 group-hover:text-hbo-cyan">
              10
            </span>
          </button>
        </div>

        {/* Bottom Glass Bar: Scrubber, Timers, Volume & Fullscreen */}
        <div className="w-full bg-black/75 backdrop-blur-xl border border-white/15 rounded-2xl p-3 sm:p-4 shadow-2xl pointer-events-auto space-y-2">
          {/* Progress / Scrub Bar */}
          <div className="relative flex items-center w-full group/scrubber cursor-pointer">
            {/* Background Track */}
            <div className="w-full h-1.5 sm:h-2 bg-white/20 rounded-full overflow-hidden relative">
              {/* Buffered Progress */}
              <div
                className="absolute top-0 left-0 h-full bg-white/30 rounded-full transition-all duration-300"
                style={{ width: `${Math.min(100, bufferedPercent)}%` }}
              />
              {/* Played Progress (HBO Purple-to-Cyan Gradient) */}
              <div
                className="absolute top-0 left-0 h-full bg-gradient-to-r from-hbo-purple-light to-hbo-cyan rounded-full transition-all duration-150"
                style={{ width: `${Math.min(100, playedPercent)}%` }}
              />
            </div>

            {/* Interactive HTML5 Range Input */}
            <input
              type="range"
              min={0}
              max={duration || 100}
              step={0.1}
              value={scrubPreviewTime !== null ? scrubPreviewTime : currentTime}
              onChange={handleScrubberChange}
              onMouseDown={() => setIsDraggingScrubber(true)}
              onTouchStart={() => setIsDraggingScrubber(true)}
              onMouseUp={handleScrubberCommit}
              onTouchEnd={handleScrubberCommit}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              aria-label="Seek Slider"
            />
          </div>

          {/* Bottom Controls Row: Play/Pause, Rewind, Forward, Time Display, Volume & Fullscreen */}
          <div className="flex items-center justify-between text-xs sm:text-sm text-white pt-1">
            {/* Left Controls */}
            <div className="flex items-center gap-3 sm:gap-4">
              {/* Play/Pause Mini Toggle */}
              <button
                type="button"
                onClick={handleTogglePlay}
                className="p-1 hover:text-hbo-cyan transition active:scale-95"
                title={isPlaying ? 'Pause' : 'Play'}
                aria-label={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? <Pause className="w-4 h-4 sm:w-5 sm:h-5 fill-current" /> : <Play className="w-4 h-4 sm:w-5 sm:h-5 fill-current" />}
              </button>

              {/* Rewind 10s Mini */}
              <button
                type="button"
                onClick={() => handleSeekRelative(-10)}
                className="p-1 text-white/80 hover:text-hbo-cyan transition flex items-center gap-0.5 active:scale-95"
                title="Rewind 10s"
              >
                <RotateCcw className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span className="text-[10px] font-bold">-10</span>
              </button>

              {/* Forward 10s Mini */}
              <button
                type="button"
                onClick={() => handleSeekRelative(10)}
                className="p-1 text-white/80 hover:text-hbo-cyan transition flex items-center gap-0.5 active:scale-95"
                title="Forward 10s"
              >
                <RotateCw className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span className="text-[10px] font-bold">+10</span>
              </button>

              {/* Playback Time Display */}
              <div className="font-mono text-[11px] sm:text-xs text-white/90 tracking-tight font-medium pl-1">
                <span className="text-white font-bold">{formatTime(currentTime)}</span>
                <span className="text-white/40 mx-1">/</span>
                <span className="text-white/70">{formatTime(duration)}</span>
              </div>
            </div>

            {/* Right Controls: Stream Badge, Mute, Fullscreen */}
            <div className="flex items-center gap-2 sm:gap-3">
              {/* Stream Badge */}
              <span className="hidden sm:inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md bg-white/10 text-white/80 font-semibold border border-white/10">
                <Zap className="w-3 h-3 text-hbo-cyan" />
                {providerLabel}
              </span>

              {/* Mute Toggle */}
              <button
                type="button"
                onClick={handleToggleMute}
                className="p-1.5 rounded-lg hover:bg-white/10 text-white/80 hover:text-white transition active:scale-95"
                title={isMuted ? 'Unmute' : 'Mute'}
                aria-label={isMuted ? 'Unmute' : 'Mute'}
              >
                {isMuted ? <VolumeX className="w-4 h-4 sm:w-5 sm:h-5 text-red-400" /> : <Volume2 className="w-4 h-4 sm:w-5 sm:h-5" />}
              </button>

              {/* Fullscreen Toggle */}
              <button
                type="button"
                onClick={onToggleFullscreen}
                className="p-1.5 rounded-lg hover:bg-white/10 text-white/80 hover:text-white transition active:scale-95"
                title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
                aria-label={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
              >
                {isFullscreen ? <Minimize2 className="w-4 h-4 sm:w-5 sm:h-5" /> : <Maximize2 className="w-4 h-4 sm:w-5 sm:h-5" />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
