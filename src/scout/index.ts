/**
 * Highlight Scout — public surface.
 *
 * Test fixtures live in `@/scout/fixtures` and are imported directly (they are not re-exported
 * here, so they never reach the production bundle through this barrel).
 */

export * from './types';
export * from './names';
export * from './stages';
export * from './subjects';
export * from './packs';
export * from './formats';
export * from './presets';
export * from './scoring';
export * from './engine';
export * from './selectors';
export * from './challenge';
export * from './data';

// Progression and stats layer (store lives in `@/store/scoutStatsStore`).
export * from './scoutStats';
export * from './progress';
export * from './achievements';
export * from './report';
