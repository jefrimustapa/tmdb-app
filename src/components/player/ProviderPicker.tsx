import React, { useState, useRef, useEffect } from 'react';
import { Server, ChevronDown, Check, ShieldCheck } from 'lucide-react';
import { STREAM_PROVIDERS, getProviderById } from '../../services/streamProviders';
import type { StreamProvider } from '../../types/stream';

interface ProviderPickerProps {
  currentProviderId: string;
  onSelect: (provider: StreamProvider) => void;
  compact?: boolean;
  isProbing?: boolean;
  serverIndex?: number;
  totalServers?: number;
}

export const ProviderPicker: React.FC<ProviderPickerProps> = ({
  currentProviderId,
  onSelect,
  compact = false,
  isProbing = false,
  serverIndex = 1,
  totalServers = STREAM_PROVIDERS.length
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedProvider = getProviderById(currentProviderId);
  // Simplified base provider name (e.g. "VidLink", "Embed.su", "VidSrc CC")
  const shortServerName = selectedProvider.name.replace(/\s*\([^)]*\)/g, '').trim();

  // When dropdown opens, automatically focus the selected or first provider
  useEffect(() => {
    if (isOpen && dropdownRef.current) {
      const activeBtn = dropdownRef.current.querySelector<HTMLElement>('[data-provider-selected="true"]') ||
                        dropdownRef.current.querySelector<HTMLElement>('.tv-focus-target');
      if (activeBtn) {
        activeBtn.focus();
      }
    }
  }, [isOpen]);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (provider: StreamProvider) => {
    onSelect(provider);
    setIsOpen(false);
    // Return focus to trigger button
    setTimeout(() => {
      const triggerBtn = dropdownRef.current?.querySelector<HTMLElement>('[data-provider-trigger="true"]');
      if (triggerBtn) {
        triggerBtn.focus();
      }
    }, 50);
  };

  const handleDropdownKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape' || e.keyCode === 27 || e.keyCode === 4 || e.key === 'BrowserBack') {
      if (isOpen) {
        e.preventDefault();
        e.stopPropagation();
        setIsOpen(false);
        const triggerBtn = dropdownRef.current?.querySelector<HTMLElement>('[data-provider-trigger="true"]');
        if (triggerBtn) {
          triggerBtn.focus();
        }
      }
    }
  };

  return (
    <div
      className={`relative flex items-center gap-2 ${compact ? 'justify-end' : 'flex-col sm:flex-row sm:items-center justify-between gap-3'}`}
      ref={dropdownRef}
      data-provider-dropdown-open={isOpen ? 'true' : undefined}
      onKeyDown={handleDropdownKeyDown}
    >
      {/* Auto-Probing HUD Pill in Header Bar */}
      {compact && isProbing && (
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-hbo-purple/40 border border-hbo-cyan/40 backdrop-blur-md text-[10px] font-bold text-hbo-cyan animate-pulse">
          <span className="w-1.5 h-1.5 rounded-full bg-hbo-cyan animate-ping" />
          <span>Probing {serverIndex}/{totalServers}</span>
        </div>
      )}

      {/* Left Label Info (Hidden in compact header overlay) */}
      {!compact && (
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-hbo-purple/20 border border-hbo-purple-light/40 text-hbo-cyan">
            <Server className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs sm:text-sm font-bold text-white flex items-center gap-1.5">
              Streaming Server
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-hbo-purple/40 text-hbo-cyan border border-hbo-cyan/30 font-bold">
                {STREAM_PROVIDERS.length} Available
              </span>
            </h4>
            <p className="text-[11px] text-gray-400">
              If a video fails or buffers, switch to an alternative server.
            </p>
          </div>
        </div>
      )}

      {/* Dropdown Container */}
      <div className={`relative ${compact ? 'w-auto' : 'w-full sm:w-72'}`}>
        {/* Dropdown Trigger Button */}
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          data-provider-trigger="true"
          data-watch-header-item="true"
          className={`flex items-center justify-between gap-2 bg-black/70 hover:bg-black/90 backdrop-blur-md border border-white/20 rounded-full text-left text-xs font-semibold text-white transition-all shadow-md focus:outline-none focus:border-hbo-cyan tv-focus-target ${
            compact ? 'px-3 py-1.5' : 'w-full px-4 py-2.5 rounded-xl'
          }`}
          title="Switch Streaming Server"
        >
          <div className="flex items-center gap-1.5 truncate">
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${isProbing ? 'bg-amber-400 animate-ping' : 'bg-green-400 animate-pulse'}`} />
            <span className="truncate font-bold text-white text-xs">{shortServerName}</span>
          </div>
          <ChevronDown className={`w-3.5 h-3.5 text-gray-400 flex-shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180 text-hbo-cyan' : ''}`} />
        </button>

        {/* Dropdown Menu Popup */}
        {isOpen && (
          <div className="absolute right-0 top-full mt-2 w-full sm:w-80 z-50 bg-hbo-card/95 backdrop-blur-xl border border-hbo-border/90 rounded-2xl p-1.5 shadow-2xl animate-fade-in divide-y divide-hbo-border/40 max-h-80 overflow-y-auto no-scrollbar">
            <div className="px-3 py-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center justify-between">
              <span>Select Stream Server</span>
              <ShieldCheck className="w-3.5 h-3.5 text-green-400" />
            </div>

            <div className="space-y-1 pt-1">
              {STREAM_PROVIDERS.map((provider) => {
                const isSelected = provider.id === currentProviderId;
                return (
                  <button
                    key={provider.id}
                    onClick={() => handleSelect(provider)}
                    data-provider-selected={isSelected ? 'true' : undefined}
                    className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-left transition-all tv-focus-target ${
                      isSelected
                        ? 'bg-gradient-to-r from-hbo-purple/40 to-hbo-cyan/20 border border-hbo-cyan text-white shadow-hbo-glow'
                        : 'text-gray-300 hover:text-white hover:bg-white/5 border border-transparent'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className={`text-xs sm:text-sm font-bold truncate ${isSelected ? 'text-hbo-cyan' : 'text-white'}`}>
                          {provider.name}
                        </p>
                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-white/10 text-gray-300 font-bold">
                          {provider.badge}
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-400 truncate mt-0.5">
                        {provider.tagline}
                      </p>
                    </div>

                    {isSelected && (
                      <Check className="w-4 h-4 text-hbo-cyan flex-shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
