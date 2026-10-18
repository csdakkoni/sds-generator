/**
 * Classification engine for mixtures under SEA (Turkish CLP).
 *
 * Pure TypeScript: no UI, database or network dependencies. Every rule is unit tested
 * against the CLP/SEA table it implements.
 */
export { hCodeOptions, isHazardCategory } from './categories';
export { classifyMixture } from './classify';
export { ENGINE_VERSION } from './version';
export * from './types';
