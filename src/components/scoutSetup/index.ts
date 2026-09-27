/**
 * Highlight Scout lobby / daily / stats building blocks.
 *
 * `scoutDemoSeed.ts` is deliberately NOT re-exported: it is a DEV-only fixture loaded through a
 * dynamic import behind `import.meta.env.DEV`, so it must never be reachable from the bundle.
 */

export * from './summary';
export * from './pool';
export * from './scoutAggregate';
export { useStartScout, isScoutRunLive } from './useStartScout';
export type { StartScoutOptions, UseStartScout } from './useStartScout';
export { ScoutFooter } from './ScoutFooter';
export { ScoutResumeBanner, ScoutReplaceDialog } from './ScoutResumeGame';
export { ScoutModePicker, SCOUT_MODE_ACCENT, scoutModeAccent } from './ScoutModePicker';
export { ScoutFormatPicker } from './ScoutFormatPicker';
export { scoutFormatSwitch, keepScoutSettings } from './formatSwitch';
export type { KeptScoutSettings } from './formatSwitch';
export { ScoutSeats } from './ScoutSeats';
export { ScoutGauntletBoard } from './ScoutGauntletBoard';
export { ScoutRunBrief } from './ScoutRunBrief';
export { ScoutPackPicker, SCOUT_PACK_CATEGORIES } from './ScoutPackPicker';
export type { ScoutPackPickerProps } from './ScoutPackPicker';
export { ScoutRules } from './ScoutRules';
export type { ScoutRulesProps } from './ScoutRules';
export { ScoutBroadcastSettings } from './ScoutBroadcastSettings';
export type { ScoutBroadcastSettingsProps } from './ScoutBroadcastSettings';
export { ScoutPresetRow, scoutPresetMatches } from './ScoutPresetRow';
export { ScoutStartBar, useScoutBarBottom } from './ScoutStartBar';
export type { ScoutStartBarProps } from './ScoutStartBar';
export { ScoutModeChart } from './ScoutModeChart';
export type { ScoutModeChartProps } from './ScoutModeChart';
export { ScoutPackStandings } from './ScoutPackStandings';
export type { ScoutPackStandingsProps } from './ScoutPackStandings';
export { ScoutNemesisList } from './ScoutNemesisList';
export type { ScoutNemesisListProps } from './ScoutNemesisList';
export { ScoutRecentRuns } from './ScoutRecentRuns';
export type { ScoutRecentRunsProps } from './ScoutRecentRuns';
export { ScoutDailyResultCard } from './ScoutDailyResultCard';
export type { ScoutDailyResultCardProps } from './ScoutDailyResultCard';
