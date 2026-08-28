import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Server, ChevronDown, Check, ShieldCheck, X } from 'lucide-react';
import { STREAM_PROVIDERS, getProviderById } from '../../services/streamProviders';
import type { StreamProvider } from '../../types/stream';

interface ProviderPickerMobileProps {
  currentProviderId: string;
  onSelect: (provider: StreamProvider) => void;
  compact?: boolean;
  isProbing?: boolean;
  serverIndex?: number;
  totalServers?: number;
}

export const ProviderPickerMobile: React.FC<ProviderPickerMobileProps> = ({
  currentProviderId,
  onSelect,
  compact = false,
  isProbing = false,
  serverIndex = 1,
  totalServers = STREAM_PROVIDERS.length,
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const selectedProvider = getProviderById(currentProviderId);
  const shortServerName = selectedProvider.name.replace(/\s*\([^)]*\)/g, '').trim();

  const handleSelect = (provider: StreamProvider) => {
    onSelect(provider);
    setIsOpen(false);
  };

  return (
    <div className="relative inline-block text-left">
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-xl border backdrop-blur-md transition-all active:scale-95 bg-black/60 border-white/20 text-gray-200"
        title="Switch Streaming Server"
      >
        <Server className="w-4 h-4 text-hbo-cyan flex-shrink-0" />
        <div className="text-left">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-bold text-white tracking-wide truncate max-w-[110px]">
              {compact ? shortServerName : selectedProvider.name}
            </span>
            <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-hbo-purple text-hbo-cyan border border-hbo-cyan/30 uppercase tracking-wider flex-shrink-0">
              {serverIndex}/{totalServers}
            </span>
          </div>
          {isProbing && (
            <p className="text-[10px] text-yellow-400 font-medium animate-pulse leading-none mt-0.5">
              Probing server...
            </p>
          )}
        </div>
        <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
      </button>

      {isOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div className="fixed inset-0 z-[9999] flex flex-col justify-end bg-black/80 backdrop-blur-md animate-fade-in touch-none">
            <div
              className="absolute inset-0"
              onClick={() => setIsOpen(false)}
              aria-label="Close modal background"
            />

            <div className="relative z-10 w-full h-[88vh] max-h-[90vh] flex flex-col rounded-t-3xl bg-hbo-card border-t border-white/20 shadow-2xl overflow-hidden animate-slide-up">
              {/* Drag Handle & Header */}
              <div className="flex flex-col items-center pt-2 pb-2 px-4 border-b border-white/10 flex-shrink-0 bg-hbo-card">
                <div className="w-12 h-1.5 rounded-full bg-white/25 mb-3" />
                <div className="w-full flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-green-400 flex-shrink-0" />
                    <span className="text-xs font-black uppercase tracking-wider text-white">
                      Select Stream Server
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-hbo-purple text-hbo-cyan font-bold">
                      {STREAM_PROVIDERS.length} Mirrors
                    </span>
                  </div>
                  <button
                    onClick={() => setIsOpen(false)}
                    className="p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-gray-300 hover:text-white transition active:scale-90"
                    aria-label="Close"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Scrollable Server List */}
              <div
                className="flex-1 overflow-y-auto px-4 py-3 space-y-2.5 touch-pan-y overscroll-contain"
                style={{ WebkitOverflowScrolling: 'touch' }}
              >
                {STREAM_PROVIDERS.map((provider) => {
                  const isSelected = provider.id === currentProviderId;
                  return (
                    <button
                      key={provider.id}
                      onClick={() => handleSelect(provider)}
                      className={`w-full flex items-center justify-between gap-3 px-4 py-3.5 rounded-2xl text-left transition-all active:scale-[0.98] ${
                        isSelected
                          ? 'bg-gradient-to-r from-hbo-purple/50 to-hbo-cyan/20 border-2 border-hbo-cyan text-white shadow-lg shadow-hbo-cyan/20'
                          : 'bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className={`text-sm font-bold ${isSelected ? 'text-hbo-cyan' : 'text-white'}`}>
                            {provider.name}
                          </p>
                          <span className="text-[10px] px-2 py-0.5 rounded-md bg-white/10 text-gray-300 font-bold whitespace-nowrap flex-shrink-0">
                            {provider.badge}
                          </span>
                        </div>
                        <p className="text-xs text-gray-400 mt-1 leading-snug">
                          {provider.tagline}
                        </p>
                      </div>
                      {isSelected && <Check className="w-5 h-5 text-hbo-cyan flex-shrink-0 ml-2" />}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
