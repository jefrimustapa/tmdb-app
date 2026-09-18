import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
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
import { resolveAnimeMalId } from '../../services/animeMappingService';
import { resolveLari21Stream } from '../../services/lariMappingService';
import { resolvePencuriStream, clearPencuriCache } from '../../services/pencuriMappingService';
import { resolveKisskhStream } from '../../services/kisskhMappingService';
import { resolveDramacoolStream, type DramacoolServer } from '../../services/dramacoolMappingService';
import { msm32Service } from '../../services/msm32MappingService';
import { SubtitleOverlay } from './SubtitleOverlay';
import type { SubtitleCue } from '../../services/subtitleService';

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
  isAnime?: boolean;
  isAsean?: boolean;
  isAsian?: boolean; // Backward compatibility alias
  isKorean?: boolean;
  releaseYear?: string | number;
  originalTitle?: string;
  customSubtitleCues?: SubtitleCue[];
  customSubtitleOffset?: number;
  customSubtitleEnabled?: boolean;
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
  episodeRuntimeMinutes,
  isAnime = false,
  isAsean = false,
  isAsian = false,
  isKorean = false,
  releaseYear,
  originalTitle,
  customSubtitleCues = [],
  customSubtitleOffset = 0,
  customSubtitleEnabled = false
}) => {
  const activeAsean = isAsean || isAsian;
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
  const [resolvingStatus, setResolvingStatus] = useState<string>('');
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionFailed, setExtractionFailed] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [topProviders, setTopProviders] = useState<string[]>(['vidlink', 'moviesapi', 'cinesrc']);
  const [topAnimeProviders, setTopAnimeProviders] = useState<string[]>(['megaplay-anime', 'cinesrc', 'moviesapi']);
  const [topAseanProviders, setTopAseanProviders] = useState<string[]>(['pencurimovie-my', 'vidlink', '111movies']);
  const [topKoreanProviders, setTopKoreanProviders] = useState<string[]>(['kisskh-kdrama', 'cinesrc', 'moviesapi']);
  const [enabledResolvers, setEnabledResolvers] = useState<StreamResolverType[]>(['embed']);
  const [playbackCurrentTime, setPlaybackCurrentTime] = useState<number>(0);

  // Up Next state
  const [showUpNext, setShowUpNext] = useState(false);
  const [countdown, setCountdown] = useState(10);
  const [autoplayNextEnabled, setAutoplayNextEnabled] = useState(true);
  const [upNextTriggerPercent, setUpNextTriggerPercent] = useState(90);
  const [upNextTimeout, setUpNextTimeout] = useState(10);
  const [tickerIntervalSec, setTickerIntervalSec] = useState(5);
  const [streamResolverTimeout, setStreamResolverTimeout] = useState(5);
  const streamResolverTimeoutRef = useRef(5);
  const [streamResolverRetries, setStreamResolverRetries] = useState(1);
  const streamResolverRetriesRef = useRef(1);

  const dismissedUpNextRef = useRef(false);
  const nextEpisodeTriggeredRef = useRef(false);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoplayNextEnabledRef = useRef(true);
  const upNextTriggerPercentRef = useRef(90);
  const upNextTimeoutRef = useRef(10);
  const tickerIntervalRef = useRef(5);
  const showUpNextRef = useRef(false);
  const nextEpisodeInfoRef = useRef(nextEpisodeInfo);
  const onNextEpisodeRef = useRef(onNextEpisode);

  // Grab TV remote focus when Up Next appears
  const grabUpNextFocus = useCallback(() => {
    const tryFocus = () => {
      if ((window as any).__tmdbHeaderFocused === true) return;
      const upNextBtn = document.getElementById('up-next-play-btn');
      if (upNextBtn) {
        upNextBtn.focus();
      }
    };
    setTimeout(tryFocus, 40);
    setTimeout(tryFocus, 120);
    setTimeout(tryFocus, 250);
  }, []);

  // Listen for dismiss event from remote Back key
  useEffect(() => {
    const handleDismissUpNext = () => {
      if (showUpNextRef.current) {
        setShowUpNext(false);
        showUpNextRef.current = false;
        dismissedUpNextRef.current = true;
      }
    };
    window.addEventListener('tmdb_dismiss_up_next', handleDismissUpNext);
    return () => {
      window.removeEventListener('tmdb_dismiss_up_next', handleDismissUpNext);
    };
  }, []);

  useEffect(() => {
    nextEpisodeInfoRef.current = nextEpisodeInfo;
    onNextEpisodeRef.current = onNextEpisode;
  }, [nextEpisodeInfo, onNextEpisode]);

  useEffect(() => {
    showUpNextRef.current = showUpNext;
  }, [showUpNext]);

  // Playback position memory refs (0% React re-render overhead)
  const currentTimeRef = useRef<number>(initialTimestamp || 0);
  const durationRef = useRef<number>(0);
  const hasSeekedInitialRef = useRef(false);
  const isPlayingRef = useRef(true); // Default to true once media starts loading
  const lastStateUpdateTimeRef = useRef<number>(0);
  const customSubtitleEnabledRef = useRef(customSubtitleEnabled);
  const customSubtitleCuesRef = useRef(customSubtitleCues);

  useEffect(() => {
    customSubtitleEnabledRef.current = customSubtitleEnabled;
    customSubtitleCuesRef.current = customSubtitleCues;
  }, [customSubtitleEnabled, customSubtitleCues]);

  // Auto-Cycle Provider until first working stream state
  const [autoCycle, setAutoCycle] = useState(true);
  const [isProbing, setIsProbing] = useState(true);
  const [triedProviders, setTriedProviders] = useState<string[]>([]);
  const [allFailed, setAllFailed] = useState(false);
  const autoCycleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const playerContainerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
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
        setEnabledResolvers(s.enabledResolvers && s.enabledResolvers.length > 0 ? s.enabledResolvers : ['embed']);
        if (s.directStreamApiUrl) {
          setDirectStreamApiUrl(s.directStreamApiUrl);
        }
        if (s.torboxApiKey) {
          setTorboxApiKey(s.torboxApiKey);
        }
        if (s.topProviders && s.topProviders.length >= 3) {
          setTopProviders(s.topProviders);
        }
        if (s.topAnimeProviders && s.topAnimeProviders.length >= 3) {
          setTopAnimeProviders(s.topAnimeProviders);
        }
        const aseanList = s.topAseanProviders || (s as any).topAsianProviders;
        if (aseanList && aseanList.length >= 3) {
          setTopAseanProviders(aseanList);
        }
        if (s.topKoreanProviders && s.topKoreanProviders.length >= 3) {
          setTopKoreanProviders(s.topKoreanProviders);
        }
        if (typeof s.autoplayNext === 'boolean') {
          setAutoplayNextEnabled(s.autoplayNext);
          autoplayNextEnabledRef.current = s.autoplayNext;
        }
        if (typeof s.upNextTriggerPercent === 'number') {
          setUpNextTriggerPercent(s.upNextTriggerPercent);
          upNextTriggerPercentRef.current = s.upNextTriggerPercent;
        }
        if (typeof s.upNextTimeout === 'number') {
          setUpNextTimeout(s.upNextTimeout);
          upNextTimeoutRef.current = s.upNextTimeout;
        }
        if (typeof s.watchProgressTickerInterval === 'number' && s.watchProgressTickerInterval >= 1 && s.watchProgressTickerInterval <= 10) {
          setTickerIntervalSec(s.watchProgressTickerInterval);
          tickerIntervalRef.current = s.watchProgressTickerInterval;
        }
        if (typeof s.streamResolverTimeout === 'number' && (s.streamResolverTimeout === 0 || (s.streamResolverTimeout >= 2 && s.streamResolverTimeout <= 30))) {
          setStreamResolverTimeout(s.streamResolverTimeout);
          streamResolverTimeoutRef.current = s.streamResolverTimeout;
        }
        if (typeof s.streamResolverRetries === 'number' && s.streamResolverRetries >= 0 && s.streamResolverRetries <= 3) {
          setStreamResolverRetries(s.streamResolverRetries);
          streamResolverRetriesRef.current = s.streamResolverRetries;
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
      setResolvingStatus('Initializing stream resolver...');

      const rawTimeout = typeof streamResolverTimeoutRef.current === 'number'
        ? streamResolverTimeoutRef.current
        : (typeof streamResolverTimeout === 'number' ? streamResolverTimeout : 0);
      const isUnlimited = rawTimeout === 0;
      const activeTimeoutMs = isUnlimited ? 0 : rawTimeout * 1000;

      // 0. TELEGRAM PROVIDER (MovieSubMalay MSM32)
      if (providerId === 'telegram-msm32' || provider.engine === 'telegram') {
        try {
          console.log(`[Resolver] Telegram Provider (${provider.name})...`);
          const msmRes = await msm32Service.resolveStream(
            title,
            releaseYear,
            mediaType === 'tv' ? season : undefined,
            mediaType === 'tv' ? episode : undefined
          );

          if (msmRes && msmRes.streamUrl) {
            console.log('[Resolver] ✅ Playing via Telegram Direct Stream:', msmRes.streamUrl);
            setResolvingStatus('Connected to Telegram Stream');
            setResolvedMsm32Url(msmRes.streamUrl);
            setDirectStreamUrl(msmRes.streamUrl);
            setDirectStreamLabel('Telegram (MSM32)');
            setPlayerMode('direct');
            setIsExtracting(false);
            setExtractionFailed(false);
            setIsLoading(false);
            setIsProbing(false);
            isPlayingRef.current = true;
            if (autoCycleTimeoutRef.current) {
              clearTimeout(autoCycleTimeoutRef.current);
              autoCycleTimeoutRef.current = null;
            }
            return;
          }

          console.warn('[Resolver] Telegram stream not found');
          if (enabledResolvers.includes('embed')) {
            setResolvingStatus('Telegram stream not found, switching to primary embed...');
            const fallbackProvider = getProviderById('vidlink');
            onProviderChange(fallbackProvider);
            return;
          } else {
            console.log('[Resolver] Telegram stream not found and Embed Resolver is disabled.');
            setResolvingStatus('No stream found in Telegram Provider.');
            setPlayerMode('error');
            setIsExtracting(false);
            setIsLoading(false);
            return;
          }
        } catch (err) {
          console.warn('[Resolver] Telegram resolution error:', err);
          if (enabledResolvers.includes('embed')) {
            const fallbackProvider = getProviderById('vidlink');
            onProviderChange(fallbackProvider);
            return;
          } else {
            setResolvingStatus('Telegram resolver error.');
            setPlayerMode('error');
            setIsExtracting(false);
            setIsLoading(false);
            return;
          }
        }
      }

      // 0a. FAST PATH: If selected provider is PencuriMovie (Malay), resolve directly with customizable timeout & retry
      if (providerId === 'pencurimovie-my') {

        const maxRetries = typeof streamResolverRetriesRef.current === 'number'
          ? streamResolverRetriesRef.current
          : (typeof streamResolverRetries === 'number' ? streamResolverRetries : 1);

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
          if (!isMounted) return;
          try {
            if (attempt > 0) {
              console.log(`[Resolver] Retrying PencuriMovie (attempt ${attempt}/${maxRetries}), clearing cache...`);
              setResolvingStatus(`Retrying PencuriMovie (${attempt}/${maxRetries})...`);
              await clearPencuriCache(title, releaseYear, season, episode, mediaType === 'tv');
              if (originalTitle && originalTitle !== title) {
                await clearPencuriCache(originalTitle, releaseYear, season, episode, mediaType === 'tv');
              }
            } else {
              console.log(`[Resolver] Fast-path Malay Provider (PencuriMovie) [timeout: ${isUnlimited ? 'unlimited' : activeTimeoutMs + 'ms'}]...`);
              setResolvingStatus('Resolving PencuriMovie Stream...');
            }

            const pencuriPromise = resolvePencuriStream(title, releaseYear, season, episode, mediaType, originalTitle, (status) => {
              if (isMounted) setResolvingStatus(status);
            });
            const pencuriRes = isUnlimited
              ? await pencuriPromise
              : await Promise.race([
                  pencuriPromise,
                  new Promise<null>((resolve) => setTimeout(() => resolve(null), activeTimeoutMs))
                ]);
            if (!isMounted) return;
            if (pencuriRes && pencuriRes.embedUrl) {
              console.log('[Resolver] ✅ Playing via PencuriMovie Embed Iframe:', pencuriRes.embedUrl);
              setResolvingStatus('Connected to PencuriMovie');
              setResolvedPencuriUrl(pencuriRes.embedUrl);
              setPlayerMode('embed');
              setDirectStreamUrl(null);
              setDirectStreamLabel('PencuriMovie (Malay)');
              setIsExtracting(false);
              setExtractionFailed(false);
              setIsLoading(false);
              setIsProbing(false);
              isPlayingRef.current = true;
              if (autoCycleTimeoutRef.current) {
                clearTimeout(autoCycleTimeoutRef.current);
                autoCycleTimeoutRef.current = null;
              }
              return;
            }

            if (attempt < maxRetries) {
              console.warn(`[Resolver] PencuriMovie attempt ${attempt + 1}/${maxRetries + 1} returned no stream, preparing retry...`);
              await clearPencuriCache(title, releaseYear, season, episode, mediaType === 'tv');
              continue;
            }
          } catch (err) {
            console.warn(`[Resolver] PencuriMovie error on attempt ${attempt + 1}:`, err);
            if (attempt < maxRetries) {
              await clearPencuriCache(title, releaseYear, season, episode, mediaType === 'tv');
              continue;
            }
          }
        }

        console.warn('[Resolver] PencuriMovie resolution exhausted all retries, auto-failover to next Asean provider...');
        setResolvingStatus('Failing over to next Asean provider...');
        const aseanFallbackId = (topAseanProviders && topAseanProviders.length > 0)
          ? topAseanProviders.find(p => p !== 'pencurimovie-my') || 'vidlink'
          : 'vidlink';
        const fallbackProvider = getProviderById(aseanFallbackId);
        onProviderChange(fallbackProvider);
        return;
      }


      // 0b. FAST PATH: If selected provider is LARI21 (Asean), resolve directly with customizable timeout
      if (providerId === 'lari21-asian' || providerId === 'lk21-asian') {
        try {
          console.log(`[Resolver] Fast-path Asean Provider (LARI21) [timeout: ${isUnlimited ? 'unlimited' : activeTimeoutMs + 'ms'}]...`);
          setResolvingStatus('Resolving LARI21 Asean Stream...');
          const lari21Promise = resolveLari21Stream(title, releaseYear, originalTitle, (status) => {
            if (isMounted) setResolvingStatus(status);
          });
          const lari21Res = isUnlimited
            ? await lari21Promise
            : await Promise.race([
                lari21Promise,
                new Promise<null>((resolve) => setTimeout(() => resolve(null), activeTimeoutMs))
              ]);
          if (!isMounted) return;
          if (lari21Res && lari21Res.embedUrl) {
            console.log('[Resolver] ✅ Playing via LARI21 Embed Iframe:', lari21Res.embedUrl);
            setResolvingStatus('Connected to LARI21 Embed');
            setResolvedLari21Url(lari21Res.embedUrl);
            setPlayerMode('embed');
            setDirectStreamUrl(null);
            setDirectStreamLabel('LARI21 Embed');
            setIsExtracting(false);
            setExtractionFailed(false);
            setIsLoading(false);
            return;
          }
          console.warn('[Resolver] LARI21 resolution returned no stream or timed out, auto-failover to next Asean provider...');
          setResolvingStatus('Failing over to next Asean provider...');
          // Fast failover to next provider in Asean priority list
          const aseanFallbackId = (topAseanProviders && topAseanProviders.length > 0)
            ? topAseanProviders.find(p => p !== 'lari21-asian' && p !== 'lk21-asian') || 'vidlink'
            : 'vidlink';
          const fallbackProvider = getProviderById(aseanFallbackId);
          onProviderChange(fallbackProvider);
          return;
        } catch (err) {
          console.warn('[Resolver] LARI21 resolution error:', err);
          const fallbackProvider = getProviderById('vidlink');
          onProviderChange(fallbackProvider);
          return;
        }
      }

      // 0b. FAST PATH: If selected provider is KissKH (Korean), resolve directly to isolated embed player with customizable timeout & failover
      if (providerId === 'kisskh-kdrama' || providerId === 'kisskh') {
        try {
          console.log(`[Resolver] Fast-path Korean Provider (KissKH) [timeout: ${isUnlimited ? 'unlimited' : activeTimeoutMs + 'ms'}]...`);
          setResolvingStatus('Resolving KissKH Korean Stream...');
          const kisskhPromise = resolveKisskhStream(title, releaseYear, season, episode, originalTitle);
          const kisskhRes = isUnlimited
            ? await kisskhPromise
            : await Promise.race([
                kisskhPromise,
                new Promise<null>((resolve) => setTimeout(() => resolve(null), activeTimeoutMs))
              ]);
          if (!isMounted) return;
          if (kisskhRes && kisskhRes.embedUrl) {
            console.log('[Resolver] ✅ Playing via KissKH Isolated Player:', kisskhRes.embedUrl);
            setResolvingStatus('Connected to KissKH Player');
            setResolvedKisskhUrl(kisskhRes.embedUrl);
            setPlayerMode('embed');
            setDirectStreamUrl(null);
            setDirectStreamLabel('KissKH Player');
            setIsExtracting(false);
            setExtractionFailed(false);
            setIsLoading(false);
            return;
          }
          console.warn('[Resolver] KissKH resolution returned no stream or timed out, auto-failover to next Korean provider...');
          setResolvingStatus('Failing over to next Korean provider...');
          // Fast failover to next provider in Korean priority list
          const koreanFallbackId = (topKoreanProviders && topKoreanProviders.length > 0)
            ? topKoreanProviders.find(p => p !== 'kisskh-kdrama' && p !== 'kisskh') || 'cinesrc'
            : 'cinesrc';
          const fallbackProvider = getProviderById(koreanFallbackId);
          onProviderChange(fallbackProvider);
          return;
        } catch (err) {
          console.warn('[Resolver] KissKH resolution error:', err);
          const koreanFallbackId = (topKoreanProviders && topKoreanProviders.length > 0)
            ? topKoreanProviders.find(p => p !== 'kisskh-kdrama' && p !== 'kisskh') || 'cinesrc'
            : 'cinesrc';
          const fallbackProvider = getProviderById(koreanFallbackId);
          onProviderChange(fallbackProvider);
          return;
        }
      }

      // 0c. FAST PATH: If selected provider is Dramacool (Korean), resolve directly without hardcoded timeout
      if (providerId === 'dramacool-kdrama') {
        try {
          console.log('[Resolver] Fast-path Korean Provider (Dramacool)...');
          setResolvingStatus('Resolving Dramacool Korean Stream...');
          const dramaRes = await resolveDramacoolStream(title, releaseYear, season, episode, originalTitle);
          if (!isMounted) return;
          if (dramaRes && dramaRes.embedUrl) {
            const activeServer = dramaRes.servers?.[0]?.name || 'Vidmoly';
            console.log(`[Resolver] ✅ Playing via Dramacool (${activeServer}):`, dramaRes.embedUrl);
            setResolvingStatus(`Connected to Dramacool (${activeServer})`);
            setDramacoolServers(dramaRes.servers || [{ name: activeServer, url: dramaRes.embedUrl }]);
            setActiveDramacoolServerIndex(0);
            setResolvedDramacoolUrl(dramaRes.embedUrl);
            setPlayerMode('embed');
            setDirectStreamUrl(null);
            setDirectStreamLabel(`Dramacool (${activeServer})`);
            setIsExtracting(false);
            setExtractionFailed(false);
            setIsLoading(false);
            return;
          }
          console.warn('[Resolver] Dramacool resolution returned no stream, auto-failover to next Korean provider...');
          setResolvingStatus('Failing over to next Korean provider...');
          const koreanFallbackId = (topKoreanProviders && topKoreanProviders.length > 0)
            ? topKoreanProviders.find(p => p !== 'dramacool-kdrama') || 'kisskh-kdrama'
            : 'kisskh-kdrama';
          const fallbackProvider = getProviderById(koreanFallbackId);
          onProviderChange(fallbackProvider);
          return;
        } catch (err) {
          console.warn('[Resolver] Dramacool resolution error:', err);
          const koreanFallbackId = (topKoreanProviders && topKoreanProviders.length > 0)
            ? topKoreanProviders.find(p => p !== 'dramacool-kdrama') || 'kisskh-kdrama'
            : 'kisskh-kdrama';
          const fallbackProvider = getProviderById(koreanFallbackId);
          onProviderChange(fallbackProvider);
          return;
        }
      }

      // 1. Try TorBox if enabled
      if (enabledResolvers.includes('torbox') && torboxApiKey && torboxApiKey.trim()) {
        try {
          console.log('[Resolver] Checking TorBox 4K Cloud...');
          setResolvingStatus('Checking TorBox 4K Cloud Debrid...');
          const torboxRes = await fetchTorboxStream(tmdbId, undefined, mediaType, season, episode, torboxApiKey);
          if (!isMounted) return;
          if (torboxRes && torboxRes.sources && torboxRes.sources.length > 0) {
            console.log(`[Resolver] ✅ Playing via TorBox 4K:`, torboxRes.sources[0].url);
            setResolvingStatus('Connected to TorBox 4K Cloud');
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
          setResolvingStatus('Querying Private Stream Extractor...');
          const directRes = await fetchDirectStream(tmdbId, title, mediaType, season, episode, directStreamApiUrl);
          if (!isMounted) return;
          if (directRes && directRes.sources && directRes.sources.length > 0) {
            console.log(`[Resolver] ✅ Playing via ${directRes.provider}:`, directRes.sources[0].url);
            setResolvingStatus(`Connected via ${directRes.provider}`);
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

      // 3. Try Telegram if enabled
      if (enabledResolvers.includes('telegram')) {
        try {
          console.log('[Resolver] Checking Telegram Provider (MovieSubMalay)...');
          setResolvingStatus('Checking Telegram MovieSubMalay Resolver...');
          const msmRes = await msm32Service.resolveStream(
            title,
            releaseYear,
            mediaType === 'tv' ? season : undefined,
            mediaType === 'tv' ? episode : undefined
          );
          if (!isMounted) return;
          if (msmRes && msmRes.streamUrl) {
            console.log('[Resolver] ✅ Playing via Telegram Direct Stream:', msmRes.streamUrl);
            setResolvingStatus('Connected to Telegram Stream');
            setResolvedMsm32Url(msmRes.streamUrl);
            setDirectStreamUrl(msmRes.streamUrl);
            setDirectStreamLabel('Telegram (MSM32)');
            setPlayerMode('direct');
            setIsExtracting(false);
            setExtractionFailed(false);
            setIsLoading(false);
            setIsProbing(false);
            isPlayingRef.current = true;
            return;
          }
        } catch (err) {
          console.warn('[Resolver] Telegram waterfall error:', err);
        }
      }

      if (!isMounted) return;

      // 4. Fallback to Embed Resolver ONLY if explicitly enabled
      if (enabledResolvers.includes('embed')) {
        console.log('[Resolver] Active: Embed Resolver');
        setResolvingStatus(`Loading embed player (${provider.name})...`);
        setPlayerMode('embed');
        setDirectStreamUrl(null);
        setDirectStreamLabel('Embed Mirror');
        setIsExtracting(false);
        setExtractionFailed(false);
      } else {
        console.log('[Resolver] Direct stream not resolved and Embed Resolver is disabled.');
        setPlayerMode('error');
      }
    };

    executeStreamResolution();

    return () => {
      isMounted = false;
    };
  }, [enabledResolvers, tmdbId, title, mediaType, season, episode, directStreamApiUrl, torboxApiKey, activeAsean, providerId, releaseYear, originalTitle, topAnimeProviders, topAseanProviders]);

  const [resumeTimestamp, setResumeTimestamp] = useState<number>(initialTimestamp || 0);
  const [resolvedMalId, setResolvedMalId] = useState<number | null>(null);

  // Attempt resolving MAL ID for anime providers or anime titles
  useEffect(() => {
    let isCancelled = false;
    if (!title || !title.trim()) return;

    resolveAnimeMalId(title).then((id) => {
      if (!isCancelled && id) {
        setResolvedMalId(id);
      }
    }).catch(() => {});

    return () => {
      isCancelled = true;
    };
  }, [title]);

  const [resolvedLari21Url, setResolvedLari21Url] = useState<string | null>(null);
  const [resolvedPencuriUrl, setResolvedPencuriUrl] = useState<string | null>(null);
  const [resolvedKisskhUrl, setResolvedKisskhUrl] = useState<string | null>(null);
  const [resolvedDramacoolUrl, setResolvedDramacoolUrl] = useState<string | null>(null);
  const [resolvedMsm32Url, setResolvedMsm32Url] = useState<string | null>(null);
  const [dramacoolServers, setDramacoolServers] = useState<DramacoolServer[]>([]);
  const [activeDramacoolServerIndex, setActiveDramacoolServerIndex] = useState<number>(0);

  const provider = getProviderById(providerId);
  const baseStreamUrl = useMemo(() => {
    // For MovieSubMalay Telegram provider
    if (provider.id === 'telegram-msm32' || provider.engine === 'telegram') {
      if (resolvedMsm32Url) {
        return resolvedMsm32Url;
      }
      return '';
    }
    // For PencuriMovie Malay provider
    if (provider.id === 'pencurimovie-my') {
      if (resolvedPencuriUrl) {
        return resolvedPencuriUrl;
      }
      return '';
    }
    // For Dramacool Korean provider
    if (provider.id === 'dramacool-kdrama') {
      if (resolvedDramacoolUrl) {
        return resolvedDramacoolUrl;
      }
      return '';
    }
    // For KissKH Korean provider
    if (provider.id === 'kisskh-kdrama' || provider.id === 'kisskh') {
      if (resolvedKisskhUrl) {
        return resolvedKisskhUrl;
      }
      return '';
    }
    // For LARI21 Asean provider
    if (provider.id === 'lari21-asian' || provider.id === 'lk21-asian') {
      if (resolvedLari21Url) {
        return resolvedLari21Url;
      }
      return '';
    }
    // For anime providers with resolved MAL ID, use getAnimeUrl for both TV episodes and Movies/OVAs
    if (provider.categories.includes('anime') && provider.getAnimeUrl && resolvedMalId) {
      return provider.getAnimeUrl(resolvedMalId, season, episode, 'sub');
    }
    // For standard titles or general movie/TV providers, use TMDB ID
    return mediaType === 'movie'
      ? provider.getMovieUrl(tmdbId)
      : provider.getTVUrl(tmdbId, season, episode);
  }, [provider, resolvedDramacoolUrl, resolvedKisskhUrl, resolvedLari21Url, resolvedPencuriUrl, resolvedMsm32Url, resolvedMalId, mediaType, tmdbId, season, episode]);

  const streamUrl = useMemo(() => {
    if (!baseStreamUrl) return '';
    // PencuriMovie, LARI21 and MegaPlay embeds do not support custom start/t/time query parameters and can crash or show a black screen
    if (provider.id === 'pencurimovie-my' || provider.id === 'lari21-asian' || provider.id === 'lk21-asian' || provider.categories.includes('asean') || provider.categories.includes('malaysian') || provider.id === 'megaplay-anime') {
      return baseStreamUrl;
    }
    // CineSrc: pass continueprompt=false to suppress the "Resume watching?" dialog, autonext=false to disable native upnext overlay, and pass t= for auto-resume
    if (provider.id === 'cinesrc') {
      const sep = baseStreamUrl.includes('?') ? '&' : '?';
      if (initialTimestamp === 0) {
        return `${baseStreamUrl}${sep}continueprompt=false&autonext=false&t=0#t=0`;
      }
      if (resumeTimestamp > 0) {
        return `${baseStreamUrl}${sep}continueprompt=false&autonext=false&t=${resumeTimestamp}#t=${resumeTimestamp}`;
      }
      return `${baseStreamUrl}${sep}continueprompt=false&autonext=false`;
    }

    // KissKH supports hash fragment #t= for seamless auto-resume or restart via injected observer
    if (provider.id === 'kisskh-kdrama' || provider.id === 'kisskh' || provider.categories.includes('korean')) {
      if (initialTimestamp === 0) {
        return `${baseStreamUrl}#t=0`;
      }
      if (resumeTimestamp > 0) {
        return `${baseStreamUrl}#t=${resumeTimestamp}`;
      }
      return baseStreamUrl;
    }
    if (initialTimestamp === 0) {
      const sep = baseStreamUrl.includes('?') ? '&' : '?';
      return `${baseStreamUrl}${sep}start=0&t=0&time=0#t=0`;
    }
    if (resumeTimestamp <= 0) return baseStreamUrl;

    const sep = baseStreamUrl.includes('?') ? '&' : '?';
    if (provider.id === 'vidlink' || provider.id === 'vidlink-anime') {
      return `${baseStreamUrl}${sep}start=${resumeTimestamp}`;
    }
    return `${baseStreamUrl}${sep}start=${resumeTimestamp}&t=${resumeTimestamp}&time=${resumeTimestamp}#t=${resumeTimestamp}`;
  }, [baseStreamUrl, resumeTimestamp, initialTimestamp, provider.id, provider.categories]);

  const lastSaveTimeRef = useRef<number>(0);

  // Unified progress recorder (Throttled to 10s to guarantee 0% CPU & I/O overhead on TV)
  const recordProgress = useCallback((currentSec: number, totalDurationSec: number, force = false) => {
    if ((!totalDurationSec || totalDurationSec <= 0) && episodeRuntimeMinutes) {
      totalDurationSec = episodeRuntimeMinutes * 60;
    }
    if ((!totalDurationSec || totalDurationSec <= 0) && durationRef.current > 0) {
      totalDurationSec = durationRef.current;
    }
    if (!totalDurationSec || totalDurationSec <= 0) {
      totalDurationSec = mediaType === 'tv' ? (isAnime ? 1440 : 2700) : 5400;
    }
    if (currentSec < 0) return;

    currentTimeRef.current = currentSec;
    const now = Date.now();

    // PERFORMANCE OPTIMIZATION:
    // Only trigger React state re-renders (setPlaybackCurrentTime) when custom subtitles are active (throttled to 250ms/4Hz),
    // or at 1Hz otherwise. This eliminates 4-10 React re-renders per second that cause playback micro-stuttering on TV.
    const isCustomSubActive = customSubtitleEnabledRef.current && (customSubtitleCuesRef.current?.length || 0) > 0;
    const minStateUpdateInterval = isCustomSubActive ? 250 : 1000;
    if (force || now - lastStateUpdateTimeRef.current >= minStateUpdateInterval) {
      lastStateUpdateTimeRef.current = now;
      setPlaybackCurrentTime(currentSec);
    }

    if (totalDurationSec > 0) {
      durationRef.current = totalDurationSec;
    }

    const effectiveDuration = totalDurationSec > 0 ? totalDurationSec : durationRef.current;
    const unclampedProgressPercent = effectiveDuration > 0
      ? Math.round((currentSec / effectiveDuration) * 100)
      : 0;
    const progressPercent = Math.min(100, Math.max(0, unclampedProgressPercent));

    // Check for Up Next trigger on TV Series when Auto-Play is enabled
    // Triggers when reaching configured % (96%-104%) or when video has ended (force === true)
    const targetPercent = upNextTriggerPercentRef.current || 96;
    const isAtOrPastTarget = unclampedProgressPercent >= targetPercent;
    const isNearEnd = totalDurationSec > 120 && (totalDurationSec - currentSec <= 75) && targetPercent <= 100;
    const isEnded = force && effectiveDuration > 0 && currentSec >= (effectiveDuration * 0.95);

    if (
      autoplayNextEnabledRef.current &&
      mediaType === 'tv' &&
      nextEpisodeInfoRef.current &&
      !showUpNextRef.current &&
      !dismissedUpNextRef.current &&
      (isAtOrPastTarget || isNearEnd || isEnded)
    ) {
      showUpNextRef.current = true;
      setShowUpNext(true);
      setCountdown(upNextTimeoutRef.current || 20);
      grabUpNextFocus();
    }

    // Throttled save to IndexedDB (matches user configured ticker interval)
    const throttleMs = Math.max(1000, (tickerIntervalRef.current || 5) * 1000);
    if (force || now - lastSaveTimeRef.current >= throttleMs || progressPercent >= 95) {
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
      }).catch(() => {});
    }
  }, [tmdbId, mediaType, title, posterPath, backdropPath, stillPath, voteAverage, season, episode, episodeTitle, episodeRuntimeMinutes]);

  // Clean up media decoders and save progress on TRUE component unmount only
  useEffect(() => {
    return () => {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
      // Force save on unmount if user was watching
      if (currentTimeRef.current > 0 && durationRef.current > 0) {
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
          timestamp: Math.round(currentTimeRef.current),
          duration: Math.round(durationRef.current),
          progressPercent: durationRef.current > 0 ? Math.min(100, Math.round((currentTimeRef.current / durationRef.current) * 100)) : 0
        }).catch(() => {});
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
    };
  }, []);

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
          showUpNextRef.current = false;
          if (autoplayNextEnabledRef.current) {
            onNextEpisodeRef.current?.();
          }
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
  }, [showUpNext]);

  // Listen for Native Android iframe / subframe playback state changes
  useEffect(() => {
    const handlePlaybackStateChanged = (e: any) => {
      const { isPlaying, currentTime, duration } = e.detail || {};
      if (isPlaying !== undefined) {
        isPlayingRef.current = !!isPlaying;
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

    // Global toggle play/pause listener (triggered by TV remote D-Pad Center/OK or Media keys)
    const handleTogglePlayPause = () => {
      // 1. If HTML5 direct video is active
      if (videoRef.current) {
        if (videoRef.current.paused) {
          videoRef.current.play().catch(() => {});
          isPlayingRef.current = true;
        } else {
          videoRef.current.pause();
          isPlayingRef.current = false;
        }
        return;
      }

      // 2. Iframe embed (Broadcast standardized commands to iframe)
      if (iframeRef.current?.contentWindow) {
        try {
          const nextCommand = isPlayingRef.current ? 'pause' : 'play';
          const isCineSrc = provider.id === 'cinesrc' || (streamUrl && streamUrl.includes('cinesrc'));
          if (isCineSrc) {
            iframeRef.current.contentWindow.postMessage({
              type: 'cinesrc:command',
              command: nextCommand,
              args: []
            }, '*');
          }
          // Send single explicit command
          iframeRef.current.contentWindow.postMessage({ type: nextCommand, action: nextCommand, command: nextCommand }, '*');
          iframeRef.current.contentWindow.postMessage({ event: 'command', func: nextCommand === 'play' ? 'playVideo' : 'pauseVideo', args: '' }, '*');

          // Optimistically flip state
          isPlayingRef.current = !isPlayingRef.current;
        } catch (e) {
          console.warn('[VideoPlayer] Error sending toggle play/pause command:', e);
        }
      }

      // 3. Focus iframe so physical spacebar/keyboard controls work
      if (iframeRef.current) {
        try {
          iframeRef.current.focus();
        } catch {}
      }
    };

    const handlePausePlayer = () => {
      // 1. Direct HTML5 video
      if (videoRef.current && !videoRef.current.paused) {
        videoRef.current.pause();
        isPlayingRef.current = false;
        return;
      }

      // 2. Iframe embed (Broadcast standardized pause command)
      if (iframeRef.current?.contentWindow) {
        try {
          const isCineSrc = provider.id === 'cinesrc' || (streamUrl && streamUrl.includes('cinesrc'));
          if (isCineSrc) {
            iframeRef.current.contentWindow.postMessage({
              type: 'cinesrc:command',
              command: 'pause',
              args: []
            }, '*');
          }
          iframeRef.current.contentWindow.postMessage({ type: 'pause', action: 'pause', command: 'pause' }, '*');
          iframeRef.current.contentWindow.postMessage({ event: 'command', func: 'pauseVideo', args: '' }, '*');
          iframeRef.current.contentWindow.postMessage({ method: 'pause' }, '*');
          iframeRef.current.contentWindow.postMessage(JSON.stringify({ event: 'command', func: 'pauseVideo' }), '*');
          iframeRef.current.contentWindow.postMessage('pause', '*');
          isPlayingRef.current = false;
        } catch (e) {
          console.warn('[VideoPlayer] Error sending pause command to iframe:', e);
        }
      }
    };

    // Seek command executor (handles both direct HTML5 video and all iframe embed schemas)
    const executeSeek = (targetTime: number, delta: number) => {
      console.log(`[VideoPlayer] executeSeek -> targetTime: ${targetTime}s, delta: ${delta}s`);

      // 1. Direct HTML5 video
      if (videoRef.current) {
        try {
          const maxDuration = durationRef.current || videoRef.current.duration || 0;
          const clamped = Math.max(0, maxDuration > 0 ? Math.min(maxDuration - 1, targetTime) : targetTime);
          videoRef.current.currentTime = clamped;
          currentTimeRef.current = clamped;
          setPlaybackCurrentTime(clamped);
          if (maxDuration > 0) {
            recordProgress(clamped, maxDuration, true);
          }
        } catch (e) {
          console.warn('[VideoPlayer] Error seeking direct video:', e);
        }
        return;
      }

      // 2. Iframe embeds (Broadcast to all player adapters)
      if (iframeRef.current?.contentWindow) {
        try {
          currentTimeRef.current = targetTime;
          setPlaybackCurrentTime(targetTime);
          if (durationRef.current > 0) {
            recordProgress(targetTime, durationRef.current, true);
          }

          const win = iframeRef.current.contentWindow;
          // Standard postMessage schemas (VidLink, PlayerJS, Plyr, CineSrc, KissKH, MegaCloud)
          win.postMessage({ type: 'seek', time: targetTime, delta }, '*');
          win.postMessage({ action: 'seek', time: targetTime }, '*');
          win.postMessage({ action: 'seekDelta', delta }, '*');
          win.postMessage({ type: 'SEEK', data: { time: targetTime } }, '*');
          win.postMessage({ event: 'seek', time: targetTime }, '*');
          win.postMessage({ event: 'command', func: 'seekTo', args: [targetTime, true] }, '*');
          win.postMessage({ channel: 'kisskh', type: 'seek', time: targetTime }, '*');
          win.postMessage({ channel: 'kisskh', event: 'seek', time: targetTime }, '*');
          win.postMessage({ channel: 'megacloud', event: 'seek', time: targetTime }, '*');
          win.postMessage({ channel: 'megaplay', event: 'seek', time: targetTime }, '*');
          win.postMessage(JSON.stringify({ type: 'seek', time: targetTime, delta }), '*');
          win.postMessage(JSON.stringify({ action: 'seek', time: targetTime }), '*');
          win.postMessage(JSON.stringify({ action: 'seekDelta', delta }), '*');
          win.postMessage(JSON.stringify({ event: 'command', func: 'seekTo', args: [targetTime, true] }), '*');
          win.postMessage(JSON.stringify({ channel: 'kisskh', type: 'seek', time: targetTime }), '*');
          win.postMessage(JSON.stringify({ channel: 'megacloud', event: 'seek', time: targetTime }), '*');

          // CineSrc specific custom command
          const isCineSrc = provider.id === 'cinesrc' || (streamUrl && streamUrl.includes('cinesrc'));
          if (isCineSrc) {
            win.postMessage({
              type: 'cinesrc:command',
              command: 'seek',
              args: [targetTime]
            }, '*');
          }
        } catch (e) {
          console.warn('[VideoPlayer] Error broadcasting seek command to iframe:', e);
        }
      }
    };

    const handleExecuteSeek = (e: any) => {
      const detail = e.detail || {};
      const delta = typeof detail.delta === 'number' ? detail.delta : 0;
      let targetTime = typeof detail.targetTime === 'number' ? detail.targetTime : null;
      if (targetTime === null) {
        targetTime = Math.max(0, (currentTimeRef.current || 0) + delta);
      }
      executeSeek(targetTime, delta);
    };

    window.addEventListener('tmdb_playback_state_changed', handlePlaybackStateChanged);
    window.addEventListener('tmdb_toggle_play_pause', handleTogglePlayPause);
    window.addEventListener('tmdb_pause_player', handlePausePlayer);
    window.addEventListener('tmdb_execute_seek', handleExecuteSeek);
    return () => {
      window.removeEventListener('tmdb_playback_state_changed', handlePlaybackStateChanged);
      window.removeEventListener('tmdb_toggle_play_pause', handleTogglePlayPause);
      window.removeEventListener('tmdb_pause_player', handlePausePlayer);
      window.removeEventListener('tmdb_execute_seek', handleExecuteSeek);
    };
  }, [recordProgress, provider.id, streamUrl]);

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

        // 3. MegaPlay / MegaCloud channel events & watching-log
        if (data.channel === 'megacloud' || data.channel === 'megaplay' || data.type === 'watching-log') {
          if (data.event === 'complete') {
            const endDur = durationRef.current || (episodeRuntimeMinutes ? episodeRuntimeMinutes * 60 : 1440);
            recordProgress(endDur, endDur, true);
            return;
          }
          const current = data.time ?? data.currentTime ?? data.seconds ?? 0;
          const dur = data.duration ?? data.totalDuration ?? 0;
          if (current > 0) {
            lastPostMessageTimeRef.current = Date.now();
            recordProgress(current, dur);
          }
          return;
        }

        // 3b. KissKH Isolated Player playback events
        if (data.type === 'kisskh' || data.channel === 'kisskh') {
          if (data.event === 'ended') {
            const endDur = durationRef.current || data.duration || (episodeRuntimeMinutes ? episodeRuntimeMinutes * 60 : 0);
            if (endDur > 0) recordProgress(endDur, endDur, true);
            return;
          }
          const current = data.currentTime ?? data.time ?? data.seconds ?? 0;
          const dur = data.duration ?? 0;
          if (current > 0) {
            lastPostMessageTimeRef.current = Date.now();
            recordProgress(current, dur);
          }
          return;
        }

        // 3b2. Dramacool / Vidmoly playback events
        if (data.type === 'dramacool' || data.channel === 'dramacool') {
          if (data.event === 'ended') {
            const endDur = durationRef.current || data.duration || (episodeRuntimeMinutes ? episodeRuntimeMinutes * 60 : 0);
            if (endDur > 0) recordProgress(endDur, endDur, true);
            return;
          }
          const current = data.currentTime ?? data.time ?? data.seconds ?? 0;
          const dur = data.duration ?? 0;
          if (current > 0) {
            lastPostMessageTimeRef.current = Date.now();
            recordProgress(current, dur);
          }
          return;
        }

        // 3c. CineSrc Native Player events & Auto-Resume Seek Bridge
        if (typeof data.type === 'string' && data.type.startsWith('cinesrc:')) {
          const subType = data.type.substring(8); // 'ready', 'timeupdate', 'play', 'pause', 'ended', 'seeked', etc.

          // On ready: if user has a saved resume timestamp, send auto-seek command into CineSrc iframe
          if (subType === 'ready') {
            if (resumeTimestamp > 0 && !hasSeekedInitialRef.current) {
              hasSeekedInitialRef.current = true;
              try {
                iframeRef.current?.contentWindow?.postMessage({
                  type: 'cinesrc:command',
                  command: 'seek',
                  args: [resumeTimestamp]
                }, '*');
              } catch {}
            }
            return;
          }

          if (subType === 'ended') {
            isPlayingRef.current = false;
            const endDur = durationRef.current || data.duration || (episodeRuntimeMinutes ? episodeRuntimeMinutes * 60 : 0);
            if (endDur > 0) recordProgress(endDur, endDur, true);
            return;
          }

          if (subType === 'play') {
            isPlayingRef.current = true;
          } else if (subType === 'pause') {
            isPlayingRef.current = false;
          }

          if (subType === 'timeupdate' || subType === 'seeked' || subType === 'play') {
            if (subType === 'play') isPlayingRef.current = true;
            const current = data.currentTime ?? 0;
            const dur = data.duration ?? 0;
            if (current > 0) {
              lastPostMessageTimeRef.current = Date.now();
              recordProgress(current, dur);
            }
            return;
          }
          return;
        }

        // 4. PlayerJS, Plyr, vidsrc, or standard event postMessages
        if (data.event === 'timeupdate' || data.event === 'progress' || data.event === 'time') {
          if (data.event === 'complete' || data.event === 'ended') {
            const endDur = durationRef.current || (episodeRuntimeMinutes ? episodeRuntimeMinutes * 60 : 0);
            if (endDur > 0) recordProgress(endDur, endDur, true);
            return;
          }
          const current = data.currentTime ?? data.data?.currentTime ?? data.time ?? data.seconds ?? 0;
          const dur = data.duration ?? data.data?.duration ?? data.totalDuration ?? 0;
          if (current > 0) {
            lastPostMessageTimeRef.current = Date.now();
            recordProgress(current, dur);
          }
        }
      } catch {}
    };

    window.addEventListener('message', handlePostMessage);
    return () => window.removeEventListener('message', handlePostMessage);
  }, [recordProgress, tmdbId, mediaType, season, episode, episodeRuntimeMinutes]);

  // Universal Fallback Elapsed Watch Session Ticker (For Sandboxed Embed Providers)
  useEffect(() => {
    if (playerMode !== 'embed' || hasError || allFailed) return;

    const intervalSec = Math.min(10, Math.max(1, tickerIntervalSec || tickerIntervalRef.current || 5));
    const intervalMs = intervalSec * 1000;

    const tickerInterval = setInterval(() => {
      // If the window/document is hidden or paused in background, do not tick
      if (typeof document !== 'undefined' && document.hidden) return;

      // If we recently received real postMessage time within the last 20 seconds, defer to postMessage
      if (Date.now() - lastPostMessageTimeRef.current < 20000) return;

      // Otherwise, advance elapsed watch session time smoothly by user-configured interval seconds
      const nextTime = (currentTimeRef.current || 0) + intervalSec;
      const defaultFallback = mediaType === 'tv' ? (isAnime ? 1440 : 2700) : 5400;
      const fallbackDur = durationRef.current || (episodeRuntimeMinutes ? episodeRuntimeMinutes * 60 : 0) || defaultFallback;
      recordProgress(nextTime, fallbackDur);
    }, intervalMs);

    return () => clearInterval(tickerInterval);
  }, [playerMode, hasError, allFailed, recordProgress, episodeRuntimeMinutes, tickerIntervalSec, mediaType, isAnime]);

  // HLS Player attachment for direct streams
  useEffect(() => {
    if (playerMode === 'direct' && directStreamUrl && videoRef.current) {
      if (Hls.isSupported() && directStreamUrl.includes('.m3u8')) {
        if (hlsRef.current) {
          hlsRef.current.destroy();
        }

        const hls = new Hls({
          enableWorker: false,
          lowLatencyMode: false,
          backBufferLength: 90,
          fragLoadingMaxRetry: 5,
          fragLoadingRetryDelay: 1000,
          fragLoadingTimeOut: 25000
        });

        hls.on(Hls.Events.ERROR, (_event, data) => {
          console.warn('[HLS] Error encountered:', data.type, data.details, 'fatal:', data.fatal, 'url:', data.frag?.url, 'response:', data.response);
          if (data.fatal) {
            switch (data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR:
                console.warn('[HLS] Fatal network error encountered, attempting recovery...');
                hls.startLoad();
                break;
              case Hls.ErrorTypes.MEDIA_ERROR:
                console.warn('[HLS] Fatal media error encountered, attempting recovery...');
                hls.recoverMediaError();
                break;
              default:
                console.error('[HLS] Unrecoverable error, falling back to embed player.');
                hls.destroy();
                setPlayerMode('embed');
                setDirectStreamUrl(null);
                break;
            }
          }
        });

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          console.log('[HLS] Manifest parsed successfully, starting playback.');
          setIsLoading(false);
          videoRef.current?.play().catch(() => {});
        });

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
      const existing = await dbService.getHistoryItem(
        tmdbId,
        mediaType,
        mediaType === 'tv' ? season : undefined,
        mediaType === 'tv' ? episode : undefined
      );
      
      const isExplicitRestart = initialTimestamp === 0;
      const targetTimestamp = (initialTimestamp !== undefined && initialTimestamp >= 0)
        ? initialTimestamp 
        : (existing?.timestamp || 0);
      
      currentTimeRef.current = targetTimestamp;
      setResumeTimestamp(targetTimestamp);

      // Provisional duration from metadata
      const defaultFallback = mediaType === 'tv' ? (isAnime ? 1440 : 2700) : 5400;
      const provisionalDuration = (episodeRuntimeMinutes ? episodeRuntimeMinutes * 60 : 0) || (existing?.duration || 0) || defaultFallback;
      durationRef.current = provisionalDuration;

      const progressPercent = (!isExplicitRestart && provisionalDuration > 0 && targetTimestamp > 0)
        ? Math.min(100, Math.round((targetTimestamp / provisionalDuration) * 100))
        : (isExplicitRestart ? 0 : (existing?.progressPercent || 0));

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

  const activeTopProviders = useMemo(() => {
    if (isKorean) return topKoreanProviders;
    if (isAnime) return topAnimeProviders;
    if (activeAsean) return topAseanProviders;
    return topProviders;
  }, [isAnime, activeAsean, isKorean, topAnimeProviders, topAseanProviders, topKoreanProviders, topProviders]);

  const orderedProviders = React.useMemo(() => getOrderedProviders(activeTopProviders, isAnime, activeAsean, isKorean), [activeTopProviders, isAnime, activeAsean, isKorean]);

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

            const seekTime = (initialTimestamp === 0) ? 0 : (resumeTimestamp > 0 ? resumeTimestamp : -1);
            if (seekTime >= 0) {
              iframe.contentWindow.postMessage({ type: 'SEEK', data: { time: seekTime } }, '*');
              iframe.contentWindow.postMessage({ event: 'seek', time: seekTime }, '*');
              iframe.contentWindow.postMessage({ type: 'seek', time: seekTime }, '*');
              iframe.contentWindow.postMessage({ channel: 'kisskh', type: 'seek', time: seekTime }, '*');
              iframe.contentWindow.postMessage({ channel: 'kisskh', event: 'seek', time: seekTime }, '*');
              iframe.contentWindow.postMessage({ channel: 'megacloud', event: 'seek', time: seekTime }, '*');
              iframe.contentWindow.postMessage({ channel: 'megaplay', event: 'seek', time: seekTime }, '*');
              iframe.contentWindow.postMessage(JSON.stringify({ type: 'seek', time: seekTime }), '*');
              iframe.contentWindow.postMessage(JSON.stringify({ channel: 'kisskh', type: 'seek', time: seekTime }), '*');
              iframe.contentWindow.postMessage(JSON.stringify({ event: 'command', func: 'seekTo', args: [seekTime, true] }), '*');
              iframe.contentWindow.postMessage(JSON.stringify({ channel: 'megacloud', event: 'seek', time: seekTime }), '*');
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

    // Inject CSS to hide CineSrc native episode selector button once iframe loads
    const styleCineSrcIframe = () => {
      try {
        const iframe = playerContainerRef.current?.querySelector('iframe');
        if (iframe) {
          iframe.setAttribute('tabindex', '-1');
          iframe.setAttribute('focusable', 'false');
          try { iframe.blur(); } catch {}
        }
        if (iframe && (iframe.src.includes('cinesrc') || provider.id === 'cinesrc')) {
          const doc = iframe.contentDocument || (iframe.contentWindow && (iframe.contentWindow as any).document);
          if (doc && !doc.__tmdb_cinesrc_styled) {
            doc.__tmdb_cinesrc_styled = true;
            const style = doc.createElement('style');
            style.id = 'tmdb-cinesrc-hide-episodes';
            style.textContent = `
              #base-ui-_r_8_,
              [id="base-ui-_r_8_"] {
                display: none !important;
                opacity: 0 !important;
                pointer-events: none !important;
                visibility: hidden !important;
                width: 0 !important;
                height: 0 !important;
                max-width: 0 !important;
                max-height: 0 !important;
                overflow: hidden !important;
                margin: 0 !important;
                padding: 0 !important;
              }
            `;
            (doc.head || doc.documentElement).appendChild(style);
          }
        }
      } catch {}
    };

    // Attempt immediately, and retry at 500ms, 1200ms, 2500ms, and 4000ms once media buffer begins
    sendUnmuteMessages();
    styleCineSrcIframe();
    setTimeout(() => {
      sendUnmuteMessages();
      activateCenterPlayButton();
      styleCineSrcIframe();
    }, 600);
    setTimeout(() => { sendUnmuteMessages(); styleCineSrcIframe(); }, 1200);
    setTimeout(() => { sendUnmuteMessages(); styleCineSrcIframe(); }, 2500);
    setTimeout(() => { sendUnmuteMessages(); styleCineSrcIframe(); }, 4000);
  };

  const handleIframeError = () => {
    if (autoCycleTimeoutRef.current) {
      clearTimeout(autoCycleTimeoutRef.current);
    }

    // If active provider is Dramacool and has backup servers (e.g. Streamtape, MixDrop), try next server first
    if (provider.id === 'dramacool-kdrama' && dramacoolServers.length > 1 && activeDramacoolServerIndex + 1 < dramacoolServers.length) {
      const nextIdx = activeDramacoolServerIndex + 1;
      const nextServer = dramacoolServers[nextIdx];
      console.warn(`[Dramacool] Active server failed. Failing over to backup server ${nextServer.name}...`);
      setActiveDramacoolServerIndex(nextIdx);
      setResolvedDramacoolUrl(nextServer.url);
      setDirectStreamLabel(`Dramacool (${nextServer.name})`);
      setIsLoading(true);
      setHasError(false);
      setIframeKey((prev) => prev + 1);
      return;
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
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/95 backdrop-blur-md px-6 text-center animate-fade-in">
          <div className="relative mb-4">
            <div className="w-14 h-14 border-4 border-hbo-purple/40 border-t-hbo-cyan rounded-full animate-spin shadow-hbo-glow" />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="w-2 h-2 rounded-full bg-hbo-cyan animate-ping" />
            </div>
          </div>
          <p className="text-base font-black text-white tracking-tight flex items-center gap-2">
            <span>Resolving Stream</span>
            <span className="inline-flex px-2 py-0.5 rounded-md bg-hbo-cyan/20 border border-hbo-cyan/40 text-hbo-cyan text-[11px] font-bold">
              {provider.name}
            </span>
          </p>
          {resolvingStatus ? (
            <p className="text-xs text-hbo-cyan/90 font-medium mt-2 max-w-sm animate-pulse tracking-wide">
              {resolvingStatus}
            </p>
          ) : (
            <p className="text-xs text-gray-400 mt-2">
              Checking: {enabledResolvers.map(r => r === 'torbox' ? 'TorBox 4K' : r === 'private_extractor' ? 'Private Extractor' : 'Embed Resolver').join(' → ')}
            </p>
          )}
        </div>
      )}

      {/* STATE 2: Embed Provider Loading Spinner */}
      {playerMode === 'embed' && isLoading && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/90 backdrop-blur-md px-6 text-center animate-fade-in">
          <div className="w-12 h-12 border-4 border-hbo-purple-light border-t-hbo-cyan rounded-full animate-spin mb-3 shadow-hbo-glow" />
          <p className="text-sm font-semibold text-gray-200">
            Loading stream via <span className="text-hbo-cyan font-bold">{provider.name}</span>...
          </p>
          {resolvingStatus && (
            <p className="text-xs text-hbo-cyan/80 font-medium mt-1.5 animate-pulse">
              {resolvingStatus}
            </p>
          )}
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
              setCountdown(upNextTimeoutRef.current || 20);
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
          ref={iframeRef}
          key={`${streamUrl}-${iframeKey}-${adShieldEnabled}`}
          src={streamUrl}
          title={title}
          loading="eager"
          tabIndex={-1}
          className="w-full h-full border-0"

          allowFullScreen
          allow="autoplay *; encrypted-media *; picture-in-picture *; fullscreen *"
          sandbox={
            (typeof (window as any).AndroidBridge !== 'undefined' || provider.id === 'vidsrc-kdrama' || provider.id.startsWith('vidsrc'))
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
            The active direct stream engines (<span className="text-white font-semibold">{enabledResolvers.map(r => r === 'torbox' ? 'TorBox 4K' : r === 'telegram' ? 'Telegram (MSM32)' : 'Private Extractor').join(', ')}</span>) did not return a working direct video stream for "<span className="text-white">{title}</span>".
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
            {provider.id === 'dramacool-kdrama' && dramacoolServers.length > 1 && (
              <button
                onClick={() => {
                  const nextIdx = (activeDramacoolServerIndex + 1) % dramacoolServers.length;
                  const nextServer = dramacoolServers[nextIdx];
                  setActiveDramacoolServerIndex(nextIdx);
                  setResolvedDramacoolUrl(nextServer.url);
                  setDirectStreamLabel(`Dramacool (${nextServer.name})`);
                  setHasError(false);
                  setIsLoading(true);
                  setIframeKey((prev) => prev + 1);
                }}
                className="px-4 py-2.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-xs sm:text-sm font-bold border border-amber-500/40 transition hover:scale-105 tv-focus-target"
              >
                Switch to {dramacoolServers[(activeDramacoolServerIndex + 1) % dramacoolServers.length]?.name || 'Backup Server'}
              </button>
            )}
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

      {/* Custom Subtitle Service Overlay */}
      <SubtitleOverlay
        cues={customSubtitleCues}
        currentTime={playbackCurrentTime}
        offsetSeconds={customSubtitleOffset}
        enabled={customSubtitleEnabled}
      />

      {/* Up Next Episode Overlay (Compact & Sleek) */}
      {showUpNext && nextEpisodeInfo && (
        <div
          data-up-next-popup="true"
          className="absolute bottom-4 right-4 sm:bottom-6 sm:right-6 z-40 w-72 sm:w-80 max-w-[calc(100vw-2rem)] bg-hbo-card/95 border border-hbo-cyan/40 rounded-2xl shadow-2xl p-3 backdrop-blur-xl animate-in fade-in slide-in-from-bottom-4 duration-300 transform-gpu"
        >
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-[10px] sm:text-[11px] font-black uppercase tracking-wider text-hbo-cyan flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-hbo-cyan animate-pulse" />
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
              <Minimize2 className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex items-center gap-2.5">
            <div className="w-20 aspect-video rounded-lg overflow-hidden bg-gray-900 flex-shrink-0 border border-white/10 relative">
              <img
                src={nextEpisodeInfo.stillPath ? tmdbImages.still(nextEpisodeInfo.stillPath, 'w300') : (backdropPath ? tmdbImages.backdrop(backdropPath, 'w300') : TMDB_FALLBACK_BACKDROP)}
                alt={nextEpisodeInfo.title || 'Next Episode'}
                className="w-full h-full object-cover"
                loading="lazy"
                decoding="async"
              />
              <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                <Play className="w-4 h-4 fill-white text-white opacity-90" />
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] text-hbo-purple-light font-bold truncate">
                S{nextEpisodeInfo.season} • E{nextEpisodeInfo.episode}
              </p>
              <h4 className="text-xs font-bold text-white truncate mt-0.5" title={nextEpisodeInfo.title || `Episode ${nextEpisodeInfo.episode}`}>
                {nextEpisodeInfo.title || `Episode ${nextEpisodeInfo.episode}`}
              </h4>
            </div>
          </div>

          {/* Action Buttons & Countdown Bar */}
          <div className="mt-2.5 space-y-2">
            <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-hbo-purple-light to-hbo-cyan transition-all duration-1000 ease-linear"
                style={{ width: `${Math.max(0, Math.min(100, (countdown / (upNextTimeoutRef.current || 20)) * 100))}%` }}
              />
            </div>
            <div className="flex items-center justify-end gap-2 pt-0.5">
              <button
                id="up-next-dismiss-btn"
                type="button"
                onClick={() => {
                  setShowUpNext(false);
                  dismissedUpNextRef.current = true;
                }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowRight') {
                    e.preventDefault();
                    document.getElementById('up-next-play-btn')?.focus();
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    setShowUpNext(false);
                    dismissedUpNextRef.current = true;
                  }
                }}
                className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white text-[11px] font-semibold transition tv-focus-target focus:ring-2 focus:ring-white focus:bg-white/30"
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
                onKeyDown={(e) => {
                  if (e.key === 'ArrowLeft') {
                    e.preventDefault();
                    document.getElementById('up-next-dismiss-btn')?.focus();
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    setShowUpNext(false);
                    dismissedUpNextRef.current = true;
                  }
                }}
                className="px-3 py-1 rounded-lg bg-gradient-to-r from-hbo-purple to-hbo-cyan text-white text-[11px] font-bold shadow-hbo-glow hover:scale-105 transition flex items-center gap-1 tv-focus-target focus:ring-2 focus:ring-white"
              >
                <Play className="w-3 h-3 fill-current" />
                Play Now
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
