/**
 * Backward compatibility re-export module: src/services/msmMappingService.ts
 * Re-exports modern tgStreamerService and types.
 */

export * from './tgStreamerService';
export {
  tgStreamerService as msmService,
  tgStreamerService as msm32Service,
  getTgStreamerServerLabel as getMsmServerLabel,
} from './tgStreamerService';
