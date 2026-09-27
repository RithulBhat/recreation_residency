/**
 * The Scout Report Card's building blocks.
 *
 * All presentational: each one takes a slice of the already-built `ScoutReport` (or the store, for
 * `ScoutDataTools`) and renders it. Nothing here aggregates — `@/scout/report` owns that.
 *
 * `demoSeed.ts` is deliberately NOT re-exported: it pulls in `@/scout/statsTestFactory` and is only
 * ever reached through a dynamic import behind `import.meta.env.DEV`.
 */

export { ScoutRankHero } from './ScoutRankHero';
export type { ScoutRankHeroProps } from './ScoutRankHero';
export { ScoutVerdict } from './ScoutVerdict';
export type { ScoutVerdictProps } from './ScoutVerdict';
export { ScoutCutBars } from './ScoutCutBars';
export type { ScoutCutBarsProps } from './ScoutCutBars';
export { ScoutLeagueMap } from './ScoutLeagueMap';
export type { ScoutLeagueMapProps } from './ScoutLeagueMap';
export { ScoutBestCall, ScoutNemesisPanel } from './ScoutBestCall';
export type { ScoutBestCallProps, ScoutNemesisPanelProps } from './ScoutBestCall';
export { ScoutAchievementCabinet } from './ScoutAchievementCabinet';
export type { ScoutAchievementCabinetProps } from './ScoutAchievementCabinet';
export { ScoutRecentForm } from './ScoutRecentForm';
export type { ScoutRecentFormProps } from './ScoutRecentForm';
export { ScoutDataTools } from './ScoutDataTools';
export type { ScoutDataToolsProps } from './ScoutDataTools';
export {
  CUT_BAND_LABEL,
  SCOUT_RARITY_LABEL,
  SCOUT_RARITY_TONE,
  VERDICT_TONE_CLASS,
  barWidth,
  cutBand,
  cutExtremes,
  drillTarget,
  formAverage,
  formTrend,
  groupTeamsByDivision,
  pct,
  rungLabel,
  sparkGeometry,
  teamCellLabel,
  teamSpineStyle,
  teamTintStyle,
} from './format';
export type { CutBand, CutExtremes, DrillTarget, MapConference, MapDivision, SparkDot, SparkGeometry } from './format';
