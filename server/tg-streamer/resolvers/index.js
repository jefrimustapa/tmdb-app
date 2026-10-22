/**
 * Resolvers Registry & Factory
 * Module: server/tg-streamer/resolvers/index.js
 */

import { BaseResolver } from './base.js';
import { MsmResolver } from './msm.js';
import { PencuriResolver } from './pencuri.js';

export * from './base.js';
export { BaseResolver } from './base.js';
export { MsmResolver } from './msm.js';
export { PencuriResolver, searchPencariApi, pencuriHttp } from './pencuri.js';

const resolverRegistry = new Map();

// Register default built-in resolvers
resolverRegistry.set('msm', MsmResolver);
resolverRegistry.set('pencuri', PencuriResolver);

export function registerResolver(id, resolverClass) {
  resolverRegistry.set(id.toLowerCase(), resolverClass);
}

export function getResolverClass(id = 'msm') {
  const key = String(id || 'msm').toLowerCase().trim();
  return resolverRegistry.get(key) || resolverRegistry.get('msm');
}

export function createResolver(id, client, options = {}) {
  const ResolverCls = getResolverClass(id);
  if (!ResolverCls) {
    throw new Error(`Unknown resolver ID: "${id}"`);
  }
  return new ResolverCls(client, options);
}

export function listResolvers() {
  const list = [];
  for (const [id, ResolverCls] of resolverRegistry.entries()) {
    try {
      const dummy = new ResolverCls(null);
      list.push({
        id: dummy.id,
        name: dummy.name,
        defaultBot: dummy.defaultBot,
      });
    } catch {
      list.push({ id, name: id, defaultBot: '' });
    }
  }
  return list;
}
