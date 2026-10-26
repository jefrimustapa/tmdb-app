import React from 'react';
import { RefreshCw } from 'lucide-react';
import type { SpeedTestState } from '../../hooks/useSpeedTest';
import {
  SPEEDTEST_TIERS,
  SPEEDTEST_TIER_LABEL,
  formatMbps,
  type SpeedTestVerdict,
  type SpeedTestBottleneck,
} from '../../utils/speedTest';

const VERDICT_STYLE: Record<SpeedTestVerdict, { label: string; badge: string }> = {
  ok: { label: 'Smooth', badge: 'text-emerald-300 bg-emerald-500/10 border-emerald-400/30' },
  marginal: { label: 'Marginal', badge: 'text-amber-300 bg-amber-500/10 border-amber-400/30' },
  slow: { label: 'Too slow', badge: 'text-rose-300 bg-rose-500/10 border-rose-400/30' },
};

const BOTTLENECK_TEXT: Record<SpeedTestBottleneck, string> = {
  network: 'Limited by the network between the server and this device',
  server: 'Limited on the server side (Telegram to router), not by this device',
};

function phaseText(state: SpeedTestState): string {
  if (state.phase === 'targets') return 'Preparing the test...';
  if (state.phase === 'baseline') return 'Measuring network speed to this device...';
  if (state.phase === '720p' || state.phase === '1080p' || state.phase === '4k') {
    return `Testing ${SPEEDTEST_TIER_LABEL[state.phase]} through Telegram...`;
  }
  return '';
}

/** Result list shared by the mobile settings drawer and the Android TV settings panel. */
export const SpeedTestResults: React.FC<{ state: SpeedTestState }> = ({ state }) => {
  const nothingYet = !state.baseline && Object.keys(state.results).length === 0 && Object.keys(state.tierErrors).length === 0 && state.missing.length === 0;

  return (
    <div className="space-y-2" aria-live="polite">
      {state.running && (
        <div className="p-2.5 rounded-xl border bg-sky-950/40 text-sky-300 border-sky-500/40 text-xs flex items-center gap-2">
          <RefreshCw className="w-4 h-4 text-sky-400 flex-shrink-0 animate-spin" />
          <span className="flex-1 truncate">{phaseText(state)}</span>
          {state.liveMbps !== null && state.liveMbps > 0 && (
            <span className="font-mono font-bold text-sky-200 flex-shrink-0">{formatMbps(state.liveMbps)} Mbps</span>
          )}
        </div>
      )}

      {state.error && (
        <div className="p-2.5 rounded-xl border bg-rose-950/40 text-rose-300 border-rose-500/40 text-xs">{state.error}</div>
      )}

      {state.baseline && (
        <div className="p-2.5 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between gap-2">
          <div>
            <span className="text-xs font-semibold text-white block">Server &rarr; this device</span>
            <span className="text-[10px] text-gray-400">Speed of the path this app uses to reach the server, without Telegram. A bandwidth limit set on the router does not apply on the home network.</span>
          </div>
          <span className="text-sm font-mono font-bold text-sky-400 flex-shrink-0">{formatMbps(state.baseline.mbps)} Mbps</span>
        </div>
      )}

      {SPEEDTEST_TIERS.map((tier) => {
        const result = state.results[tier];
        const tierError = state.tierErrors[tier];
        const isMissing = state.missing.includes(tier);
        if (!result && !tierError && !isMissing) return null;

        return (
          <div key={tier} className="p-2.5 rounded-xl bg-white/5 border border-white/10 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-white">{SPEEDTEST_TIER_LABEL[tier]}</span>
              {result && (
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${VERDICT_STYLE[result.verdict].badge}`}>
                  {VERDICT_STYLE[result.verdict].label}
                </span>
              )}
            </div>

            {isMissing && <p className="text-[11px] text-gray-400">No sample file for this quality on the server.</p>}
            {tierError && <p className="text-[11px] text-rose-300">{tierError}</p>}

            {result && (
              <>
                <div className="flex items-end justify-between gap-2">
                  <div>
                    <span className="text-lg font-mono font-bold text-white leading-none">
                      {formatMbps(result.mbps)} <span className="text-[10px] text-gray-400 font-semibold">Mbps</span>
                    </span>
                    <span className="text-[10px] text-gray-400 block">delivered to this device</span>
                  </div>
                  <span className="text-[10px] text-gray-400 text-right">
                    needs {result.minMbps} Mbps &bull; first byte {Math.round(result.firstByteMs)} ms
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px] pt-0.5">
                  <span className="text-gray-400">Telegram &rarr; router</span>
                  <span className="font-mono font-semibold text-sky-300">
                    {result.telegramMbps !== null
                      ? `${result.telegramIsLowerBound ? '≥ ' : ''}${formatMbps(result.telegramMbps)} Mbps`
                      : 'n/a'}
                  </span>
                </div>
                {result.verdict !== 'ok' && result.bottleneck && (
                  <p className="text-[11px] text-amber-200/90">{BOTTLENECK_TEXT[result.bottleneck]}</p>
                )}
                <p className="text-[10px] text-gray-500 truncate" title={result.filename}>
                  {result.filename}
                  {result.dcId !== null ? ` • DC ${result.dcId}` : ''}
                </p>
              </>
            )}
          </div>
        );
      })}

      {!state.running && !nothingYet && state.finishedAt && (
        <p className="text-[10px] text-gray-500 text-center">
          Last run {new Date(state.finishedAt).toLocaleTimeString()}
          {state.sizeMb ? ` • ${state.sizeMb} MB per test` : ''}
        </p>
      )}
    </div>
  );
};
