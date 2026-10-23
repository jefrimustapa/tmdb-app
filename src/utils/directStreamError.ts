import type { StreamResolverType } from '../types/db';

export interface DirectStreamErrorView {
  /** Names of the active engines, e.g. "Embed Resolver, TGStrm" */
  engines: string;
  /** Set when Embed Resolver is off in Settings: show the "disabled" hint and the enable action */
  embedDisabled: boolean;
  /** Why resolving failed (the resolver's status text); only used when Embed Resolver is enabled */
  reason: string | null;
}

/**
 * Decides what the "Could Not Resolve Direct Stream" screen says.
 * The screen is reached from many failure paths, not only when Embed Resolver is off,
 * so the "disabled" hint must follow the actual setting (#262).
 */
export function getDirectStreamErrorView(
  enabledResolvers: StreamResolverType[],
  resolvingStatus?: string | null,
): DirectStreamErrorView {
  const embedDisabled = !enabledResolvers.includes('embed');
  const reason = (resolvingStatus || '').trim();
  return {
    engines: enabledResolvers.map(r => (r === 'telegram' ? 'TGStrm' : 'Embed Resolver')).join(', '),
    embedDisabled,
    reason: !embedDisabled && reason ? reason : null,
  };
}
