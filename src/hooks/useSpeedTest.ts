import { useCallback, useEffect, useRef, useState } from 'react';
import {
  tgStreamerService,
  SpeedTestBaseline,
  SpeedTestError,
  SpeedTestQualityResult,
} from '../services/tgStreamerService';
import { SPEEDTEST_TIERS, SpeedTestTier } from '../utils/speedTest';

export type SpeedTestPhase = 'idle' | 'targets' | 'baseline' | SpeedTestTier | 'done';

export interface SpeedTestState {
  running: boolean;
  phase: SpeedTestPhase;
  /** Live rate of the step in progress (Mbps), null before data flows. */
  liveMbps: number | null;
  baseline: SpeedTestBaseline | null;
  results: Partial<Record<SpeedTestTier, SpeedTestQualityResult>>;
  /** Per quality failures (the other qualities still run). */
  tierErrors: Partial<Record<SpeedTestTier, string>>;
  /** Qualities the server has no sample file for. */
  missing: SpeedTestTier[];
  /** MB read per test, as configured on the server. */
  sizeMb: number | null;
  error: string | null;
  finishedAt: number | null;
}

const INITIAL: SpeedTestState = {
  running: false,
  phase: 'idle',
  liveMbps: null,
  baseline: null,
  results: {},
  tierErrors: {},
  missing: [],
  sizeMb: null,
  error: null,
  finishedAt: null,
};

function describeError(err: unknown): string {
  if (err instanceof SpeedTestError) {
    if (err.code === 'rate-limited') {
      return `Speed test limit reached. Try again in ${err.retryAfterSec ?? 60}s.`;
    }
    return err.message;
  }
  return (err as any)?.message || 'Speed test failed';
}

/**
 * Network Speed Analytics (issue #281), shared by the mobile and TV settings screens.
 * Runs the router -> device baseline, then the chosen qualities one after another (never in parallel,
 * which would split the bandwidth and distort every number).
 */
export function useSpeedTest() {
  const [state, setState] = useState<SpeedTestState>(INITIAL);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const patch = useCallback((p: Partial<SpeedTestState>) => setState(prev => ({ ...prev, ...p })), []);

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const start = useCallback(async (tiers: SpeedTestTier[]) => {
    if (abortRef.current) return; // already running
    const wanted = SPEEDTEST_TIERS.filter(t => tiers.includes(t));
    if (wanted.length === 0) return;

    const controller = new AbortController();
    abortRef.current = controller;
    const { signal } = controller;
    setState({ ...INITIAL, running: true, phase: 'targets' });

    try {
      const targetsRes = await tgStreamerService.getSpeedTestTargets(wanted, signal);
      patch({ sizeMb: targetsRes.mb, missing: targetsRes.missing || [], phase: 'baseline' });

      let baseline: SpeedTestBaseline | null = null;
      try {
        baseline = await tgStreamerService.runNetworkBaseline(signal, (mbps) => patch({ liveMbps: mbps }));
        patch({ baseline, liveMbps: null });
      } catch (err) {
        if ((err as any)?.name === 'AbortError') throw err;
        if (err instanceof SpeedTestError && err.code === 'rate-limited') throw err;
        // Without a baseline the qualities still run, only the bottleneck cannot be told
        patch({ liveMbps: null });
      }

      for (const target of targetsRes.targets) {
        if (signal.aborted) break;
        patch({ phase: target.tier, liveMbps: null });
        try {
          const result = await tgStreamerService.runQualityTest(
            target,
            baseline?.mbps ?? null,
            signal,
            (mbps) => patch({ liveMbps: mbps }),
          );
          setState(prev => ({ ...prev, results: { ...prev.results, [target.tier]: result }, liveMbps: null }));
        } catch (err) {
          if ((err as any)?.name === 'AbortError') throw err;
          if (err instanceof SpeedTestError && err.code === 'rate-limited') throw err;
          setState(prev => ({ ...prev, tierErrors: { ...prev.tierErrors, [target.tier]: describeError(err) }, liveMbps: null }));
        }
      }
      patch({ phase: 'done', finishedAt: Date.now() });
    } catch (err) {
      if ((err as any)?.name === 'AbortError') {
        patch({ phase: 'idle' });
      } else {
        patch({ error: describeError(err), phase: 'idle' });
      }
    } finally {
      abortRef.current = null;
      patch({ running: false, liveMbps: null });
    }
  }, [patch]);

  return { state, start, stop };
}
