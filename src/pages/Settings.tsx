import React, { useState, useEffect, useRef } from 'react';
import { dbService } from '../services/db';
import type { UserSettings } from '../types/db';
import { STREAM_PROVIDERS } from '../services/streamProviders';
import { useDevice } from '../hooks/useDevice';
import { Logo } from '../components/common/Logo';
import { APP_VERSION, APP_BUILD_NUMBER, APP_VERSION_FULL, APP_BUILD_CHANNEL } from '../version';
import { Settings as SettingsIcon, Tv2, Smartphone, Tablet, Monitor, ShieldCheck, Server, Database, Check, ShieldAlert, EyeOff, Lock, Zap, X, CalendarX } from 'lucide-react';

export const Settings: React.FC = () => {
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [savedMessage, setSavedMessage] = useState(false);
  const [showEasterEgg, setShowEasterEgg] = useState(false);
  const clickCountRef = useRef(0);
  const clickTimerRef = useRef<NodeJS.Timeout | null>(null);
  const { deviceMode, setDeviceMode, detectedPlatform, activeLayout } = useDevice();

  const handleBuildNumberClick = () => {
    clickCountRef.current += 1;
    if (clickTimerRef.current) {
      clearTimeout(clickTimerRef.current);
    }

    if (clickCountRef.current >= 3) {
      clickCountRef.current = 0;
      setShowEasterEgg(true);
    } else {
      clickTimerRef.current = setTimeout(() => {
        clickCountRef.current = 0;
      }, 1500);
    }
  };

  useEffect(() => {
    dbService.getSettings().then(setSettings);
  }, []);

  const handleUpdate = async (partial: Partial<UserSettings>) => {
    const updated = await dbService.updateSettings(partial);
    setSettings(updated);
    if (partial.deviceMode) {
      setDeviceMode(partial.deviceMode);
    }
    setSavedMessage(true);
    setTimeout(() => setSavedMessage(false), 2500);
  };

  if (!settings) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-hbo-cyan border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-24 pb-40 px-4 sm:px-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8 pb-4 border-b border-hbo-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-hbo-purple/20 border border-hbo-purple/40 flex items-center justify-center">
            <SettingsIcon className="w-5 h-5 text-hbo-purple-light" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-black font-display text-white">System Settings</h1>
            <p className="text-xs sm:text-sm text-gray-400">Manage device mode, ad shields, and streaming resolvers</p>
          </div>
        </div>

        {savedMessage && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 rounded-full text-xs font-semibold animate-fade-in">
            <Check className="w-4 h-4" />
            <span>Saved</span>
          </div>
        )}
      </div>

      <div className="space-y-6">
        {/* Device Profile Mode */}
        <div className="bg-hbo-card border border-hbo-border rounded-2xl p-5 sm:p-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-base sm:text-lg font-bold font-display text-white flex items-center gap-2">
              <Tv2 className="w-5 h-5 text-hbo-cyan" />
              <span>Device Experience Mode</span>
            </h3>
            <span className="text-xs px-2.5 py-1 rounded-full bg-hbo-dark/80 border border-hbo-border text-hbo-cyan font-semibold">
              Active: {activeLayout.toUpperCase()} ({settings.deviceMode === 'auto' ? 'Auto-Detected' : 'Manual Override'})
            </span>
          </div>
          <p className="text-xs text-gray-400 mb-4">
            Select your preferred display format or keep Auto-Detect for responsive switching.
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[
              {
                id: 'auto',
                label: 'Auto Detect',
                icon: Monitor,
                desc: `Live: ${detectedPlatform.toUpperCase()}`
              },
              { id: 'tv', label: 'Android TV', icon: Tv2, desc: 'D-Pad spatial focus' },
              { id: 'tablet', label: 'Tablet / Pad', icon: Tablet, desc: 'Expanded grid touch' },
              { id: 'mobile', label: 'Mobile Phone', icon: Smartphone, desc: 'Bottom navigation' },
              { id: 'desktop', label: 'Desktop / PC', icon: Monitor, desc: 'Wide cinema rail' },
            ].map((mode) => {
              const Icon = mode.icon;
              const isSelected = settings.deviceMode === mode.id;
              return (
                <button
                  key={mode.id}
                  onClick={() => handleUpdate({ deviceMode: mode.id as any })}
                  className={`p-3.5 rounded-xl border text-left transition-all tv-focus-target ${
                    isSelected
                      ? 'bg-gradient-to-r from-hbo-purple/40 to-hbo-cyan/20 border-hbo-cyan shadow-hbo-glow'
                      : 'bg-hbo-dark/60 border-hbo-border hover:bg-hbo-hover'
                  }`}
                >
                  <Icon className={`w-5 h-5 mb-2 ${isSelected ? 'text-hbo-cyan' : 'text-gray-400'}`} />
                  <p className="text-sm font-bold text-white">{mode.label}</p>
                  <p className={`text-[11px] mt-0.5 ${isSelected ? 'text-hbo-cyan font-semibold' : 'text-gray-400'}`}>
                    {mode.desc}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Stream Header Overlay Auto-Hide */}
        <div className="bg-hbo-card border border-hbo-border rounded-2xl p-5 sm:p-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-base sm:text-lg font-bold font-display text-white flex items-center gap-2">
              <EyeOff className="w-5 h-5 text-hbo-cyan" />
              <span>Stream Header Auto-Hide Timeout</span>
            </h3>
            <span className="text-xs px-2.5 py-1 rounded-full bg-hbo-dark/80 border border-hbo-border text-hbo-cyan font-semibold">
              {(settings.streamHeaderTimeout || 5) === 0 ? 'Always Visible' : `${settings.streamHeaderTimeout || 5} Seconds`}
            </span>
          </div>
          <p className="text-xs text-gray-400 mb-4">
            Automatically fade out the top overlay header (back button, title, server picker) while streaming. Tap screen to reveal anytime.
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {[
              { seconds: 3, label: '3 Seconds', desc: 'Quick fade out' },
              { seconds: 5, label: '5 Seconds (Default)', desc: 'Standard cinema mode' },
              { seconds: 8, label: '8 Seconds', desc: 'Relaxed duration' },
              { seconds: 0, label: 'Always Visible', desc: 'Do not auto-hide' }
            ].map((opt) => {
              const isSelected = (settings.streamHeaderTimeout ?? 5) === opt.seconds;
              return (
                <button
                  key={opt.seconds}
                  onClick={() => handleUpdate({ streamHeaderTimeout: opt.seconds })}
                  className={`p-3 rounded-xl border text-left transition-all tv-focus-target ${
                    isSelected
                      ? 'bg-hbo-cyan/20 border-hbo-cyan text-white shadow-hbo-glow'
                      : 'bg-hbo-dark/60 border-hbo-border text-gray-400 hover:text-gray-200'
                  }`}
                >
                  <p className={`text-xs font-bold ${isSelected ? 'text-hbo-cyan' : 'text-white'}`}>
                    {opt.label}
                  </p>
                  <p className="text-[11px] text-gray-400 mt-0.5">{opt.desc}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Preferred Stream Provider */}
        <div className="bg-hbo-card border border-hbo-border rounded-2xl p-5 sm:p-6">
          <h3 className="text-base sm:text-lg font-bold font-display text-white flex items-center gap-2 mb-2">
            <Server className="w-5 h-5 text-hbo-purple-light" />
            <span>Default Streaming Resolver</span>
          </h3>
          <p className="text-xs text-gray-400 mb-4">
            Choose which provider automatically loads when clicking Play.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {STREAM_PROVIDERS.map((provider) => {
              const isSelected = settings.preferredProvider === provider.id;
              return (
                <button
                  key={provider.id}
                  onClick={() => handleUpdate({ preferredProvider: provider.id })}
                  className={`flex items-center justify-between p-4 rounded-xl border text-left transition-all tv-focus-target ${
                    isSelected
                      ? 'bg-hbo-purple/30 border-hbo-purple-light shadow-hbo-glow'
                      : 'bg-hbo-dark/60 border-hbo-border hover:bg-hbo-hover'
                  }`}
                >
                  <div className="flex-1 min-w-0 pr-2">
                    <p className="text-sm font-bold text-white">{provider.name}</p>
                    <p className="text-xs text-gray-400 mt-0.5 truncate">{provider.tagline}</p>
                  </div>
                  <span className={`flex-shrink-0 text-xs px-2 py-0.5 rounded font-bold ${
                    isSelected ? 'bg-hbo-cyan text-black' : 'bg-white/10 text-gray-300'
                  }`}>
                    {provider.badge}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Content Safety & Filtering */}
        <div className="bg-hbo-card border border-hbo-border rounded-2xl p-5 sm:p-6 space-y-5">
          {/* Adult Content */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1 min-w-0 pr-2">
              <h3 className="text-base sm:text-lg font-bold font-display text-white flex items-center gap-2 mb-1">
                <EyeOff className="w-5 h-5 text-amber-400 flex-shrink-0" />
                <span>Filter Adult & Explicit Content</span>
              </h3>
              <p className="text-xs text-gray-400">
                SafeSearch mode: Excludes 18+ adult rated media from search queries and discovery catalogs.
              </p>
            </div>

            <button
              onClick={() => handleUpdate({ filterAdult: settings.filterAdult === false ? true : false })}
              className={`flex-shrink-0 w-12 h-6 rounded-full transition-colors relative tv-focus-target ${
                settings.filterAdult !== false ? 'bg-amber-500' : 'bg-gray-700'
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full bg-white transition-transform transform ${
                  settings.filterAdult !== false ? 'translate-x-6' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>

          {/* Unreleased Content Filter */}
          <div className="border-t border-hbo-border/60 pt-4 flex items-center justify-between gap-4">
            <div className="flex-1 min-w-0 pr-2">
              <h3 className="text-base sm:text-lg font-bold font-display text-white flex items-center gap-2 mb-1">
                <CalendarX className="w-5 h-5 text-hbo-cyan flex-shrink-0" />
                <span>Filter Out Unreleased Titles</span>
              </h3>
              <p className="text-xs text-gray-400">
                Hide future and unreleased movies and TV series that have not yet premiered or released in theaters/streaming.
              </p>
            </div>

            <button
              onClick={() => handleUpdate({ filterUnreleased: settings.filterUnreleased === false ? true : false })}
              className={`flex-shrink-0 w-12 h-6 rounded-full transition-colors relative tv-focus-target ${
                settings.filterUnreleased !== false ? 'bg-hbo-cyan' : 'bg-gray-700'
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full bg-white transition-transform transform ${
                  settings.filterUnreleased !== false ? 'translate-x-6' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>

          <div className="border-t border-hbo-border/60 pt-4">
            <h4 className="text-xs font-bold text-gray-300 uppercase tracking-wider mb-2 flex items-center gap-2">
              <Lock className="w-4 h-4 text-hbo-cyan flex-shrink-0" />
              <span>Catalog Maturity Level / Parental Filter</span>
            </h4>
            <p className="text-xs text-gray-400 mb-3">
              Limit discovery catalog recommendations to age-appropriate certification tiers.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {[
                { id: 'all', label: 'All Ratings', desc: 'Unrestricted (R, TV-MA, PG-13, PG, G)' },
                { id: 'pg13', label: 'Teens & Below', desc: 'Up to PG-13 / TV-14 (Excludes R & TV-MA)' },
                { id: 'family', label: 'Family & Kids', desc: 'Up to PG / TV-PG (Family friendly only)' },
              ].map((lvl) => {
                const isSelected = (settings.maturityLevel || 'all') === lvl.id;
                return (
                  <button
                    key={lvl.id}
                    onClick={() => handleUpdate({ maturityLevel: lvl.id as any })}
                    className={`p-3 rounded-xl border text-left transition-all tv-focus-target ${
                      isSelected
                        ? 'bg-hbo-cyan/20 border-hbo-cyan text-white shadow-hbo-glow'
                        : 'bg-hbo-dark/60 border-hbo-border text-gray-400 hover:text-gray-200'
                    }`}
                  >
                    <p className={`text-xs font-bold ${isSelected ? 'text-hbo-cyan' : 'text-white'}`}>
                      {lvl.label}
                    </p>
                    <p className="text-[11px] text-gray-400 mt-0.5">{lvl.desc}</p>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Direct Stream Extractor (Option A) */}
        <div className="bg-hbo-card border border-hbo-border rounded-2xl p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1 min-w-0 pr-2">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <h3 className="text-base sm:text-lg font-bold font-display text-white flex items-center gap-2">
                  <Zap className="w-5 h-5 text-hbo-cyan flex-shrink-0" />
                  <span>Direct Stream Extractor (Option A)</span>
                </h3>
                <span className="px-2 py-0.5 rounded bg-hbo-purple/40 text-hbo-cyan border border-hbo-purple-light text-[10px] font-extrabold uppercase tracking-wider">
                  Experimental
                </span>
              </div>
              <p className="text-xs text-gray-400 leading-relaxed">
                Attempts background stream sniffing to extract direct <code className="text-hbo-cyan font-mono text-[11px]">.m3u8</code> / <code className="text-hbo-cyan font-mono text-[11px]">.mp4</code> media links and play them inside a clean native player instead of provider iframes. Automatically falls back to standard player if encrypted.
              </p>
            </div>

            <button
              onClick={() => handleUpdate({ directStreamMode: !settings.directStreamMode })}
              className={`flex-shrink-0 w-12 h-6 rounded-full transition-colors relative tv-focus-target ${
                settings.directStreamMode ? 'bg-hbo-cyan' : 'bg-gray-700'
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full bg-black transition-transform transform ${
                  settings.directStreamMode ? 'translate-x-6' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>

          {settings.directStreamMode && (
            <div className="p-3.5 rounded-xl bg-hbo-purple/15 border border-hbo-purple-light/40 text-xs text-gray-300 space-y-1">
              <p className="font-bold text-hbo-cyan flex items-center gap-1.5">
                <span>⚡ Option A Active</span>
              </p>
              <p className="text-[11px] text-gray-400">
                Direct HLS stream extractor will initialize when opening titles. You can toggle between Native Player and Embed Player at any time on the watch screen.
              </p>
            </div>
          )}
        </div>

        {/* Ad & Popup Shield */}
        <div className="bg-hbo-card border border-hbo-border rounded-2xl p-5 sm:p-6 flex items-center justify-between gap-4">
          <div className="flex-1 min-w-0 pr-2">
            <h3 className="text-base sm:text-lg font-bold font-display text-white flex items-center gap-2 mb-1">
              <ShieldCheck className="w-5 h-5 text-green-400 flex-shrink-0" />
              <span>Ad & Popup Sandboxing</span>
            </h3>
            <p className="text-xs text-gray-400">
              Restricts iframe popups, new window triggers, and click hijacking.
            </p>
          </div>

          <button
            onClick={() => handleUpdate({ adBlockShield: !settings.adBlockShield })}
            data-settings-bottom="true"
            className={`flex-shrink-0 w-12 h-6 rounded-full transition-colors relative tv-focus-target ${
              settings.adBlockShield ? 'bg-hbo-purple-light' : 'bg-gray-700'
            }`}
          >
            <div
              className={`w-5 h-5 rounded-full bg-white transition-transform transform ${
                settings.adBlockShield ? 'translate-x-6' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>

        {/* About & Metadata Card */}
        <div className="w-full bg-hbo-card/40 border border-hbo-border/60 rounded-2xl p-5 sm:p-6 text-xs text-gray-400 space-y-3 text-left">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <p className="font-bold text-gray-200 text-sm flex items-center gap-2">
                <span>TMDB Streamer v{APP_VERSION}</span>
                {APP_BUILD_CHANNEL !== 'stable' && (
                  <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-hbo-cyan/20 text-hbo-cyan border border-hbo-cyan/40">
                    {APP_BUILD_CHANNEL}
                  </span>
                )}
              </p>
              <p className="text-[11px] text-gray-400 mt-0.5">{APP_VERSION_FULL}</p>
            </div>
            
            {/* Build Number as a dedicated focusable / selectable button */}
            <button
              type="button"
              onClick={handleBuildNumberClick}
              className="px-3.5 py-1.5 rounded-full bg-hbo-purple/30 border border-hbo-purple-light text-hbo-cyan font-mono text-xs font-bold tv-focus-target focus:outline-none focus:border-hbo-cyan focus:ring-2 focus:ring-hbo-cyan/60 focus:bg-hbo-purple/60 focus:shadow-hbo-glow transition-all cursor-pointer inline-flex items-center gap-1.5 active:scale-95"
            >
              <span>Build #{APP_BUILD_NUMBER}</span>
            </button>
          </div>
          <p className="text-gray-400 text-xs leading-relaxed">
            This application uses the TMDB API and free third-party streaming video embeds.
          </p>
        </div>
      </div>

      {/* Full Page Logo Screen (Easter Egg on 3 taps) */}
      {showEasterEgg && (
        <div
          onClick={() => setShowEasterEgg(false)}
          className="fixed inset-0 z-50 bg-hbo-dark/95 backdrop-blur-2xl flex flex-col items-center justify-center p-6 animate-fade-in cursor-pointer select-none"
        >
          <button
            onClick={() => setShowEasterEgg(false)}
            className="absolute top-8 right-8 p-3 rounded-full bg-white/10 hover:bg-white/20 border border-white/10 text-gray-300 hover:text-white transition-all tv-focus-target focus:outline-none focus:ring-2 focus:ring-hbo-cyan"
            aria-label="Close"
          >
            <X className="w-6 h-6" />
          </button>

          <div className="flex flex-col items-center justify-center text-center space-y-6 animate-scale-in max-w-sm w-full">
            <div className="p-6 sm:p-8 rounded-3xl bg-hbo-card/90 border border-hbo-border/80 shadow-[0_0_60px_rgba(144,85,255,0.3)] flex items-center justify-center">
              <Logo size="lg" showText={true} />
            </div>

            <div className="space-y-2">
              <span className="px-3.5 py-1 rounded-full bg-hbo-purple/30 border border-hbo-purple-light text-hbo-cyan font-mono text-xs font-bold shadow-sm inline-block">
                v{APP_VERSION} (Build #{APP_BUILD_NUMBER})
              </span>
              <p className="text-xs text-gray-400">
                Community Streaming & Discovery Suite
              </p>
            </div>

            <p className="text-[11px] text-gray-500 pt-4">
              Tap anywhere or press back to return
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
