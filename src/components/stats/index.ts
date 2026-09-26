/**
 * Stats screen building blocks. All local-first and presentational — they take
 * slices of `useStatsStore` (or the store itself, for `DataTools`) and render.
 *
 * `demoSeed.ts` is deliberately NOT re-exported here: it pulls in
 * `@/stats/testFactory` and is only ever loaded through a dynamic import behind
 * `import.meta.env.DEV`.
 */

export { RankHero } from './RankHero';
export type { RankHeroProps } from './RankHero';
export { ClipBucketChart, bucketStandings, sharpestBucket } from './ClipBucketChart';
export type { ClipBucketChartProps } from './ClipBucketChart';
export { FormStrip } from './FormStrip';
export type { FormStripProps } from './FormStrip';
export { RecentGames } from './RecentGames';
export type { RecentGamesProps } from './RecentGames';
export { PackStandings, packStandings } from './PackStandings';
export type { PackStandingsProps } from './PackStandings';
export { AchievementGrid } from './AchievementGrid';
export type { AchievementGridProps } from './AchievementGrid';
export { HistoryList } from './HistoryList';
export type { HistoryListProps } from './HistoryList';
export { DataTools } from './DataTools';
export type { DataToolsProps } from './DataTools';
export {
  MODE_EMOJI,
  MODE_LABEL,
  RARITY_LABEL,
  RARITY_TONE,
  absoluteTime,
  clipLabel,
  formatDuration,
  pct,
  relativeTime,
} from './format';
