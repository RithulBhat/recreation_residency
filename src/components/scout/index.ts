/**
 * Highlight Scout play + reveal components. The screens in `src/screens/scout/` import from here.
 */

export {
  VISUAL_MODES,
  VISUAL_RANGE,
  SILHOUETTE_CUT,
  SILHOUETTE_CUT_STOPS,
  SILHOUETTE_OBJECT_POSITION,
  SILHOUETTE_SCALE,
  CURTAIN_FEATHER,
  FACE_ZOOM_STOPS,
  LOGO_ZOOM_STOPS,
  MIN_STAGE_PX,
  REVEAL_MS,
  RIM_COLOR,
  FACE_JITTER,
  LOGO_FOCUS_RANGE,
  clamp01,
  curtainMask,
  faceOriginX,
  isVisualMode,
  lerp,
  logoOrigin,
  silhouetteCurtain,
  silhouetteFilter,
  specPosition,
  visualDescription,
  visualStyle,
} from './visuals';
export type { SilhouetteCurtain, SilhouetteFilter, VisualMode, VisualStyle, VisualStyleInput } from './visuals';

export {
  VERDICT_LABEL,
  VERDICT_TONE,
  buildLine,
  clock,
  draftLine,
  espnPlayerUrl,
  espnTeamUrl,
  playerLine,
  points,
  railClues,
  roundVerdict,
  rungValue,
  shortPoints,
  stageClues,
  stageOwnsAll,
  subjectNoun,
  superBowlLine,
  teamLine,
  triesUsed,
} from './format';

export { SubjectStage, stageImage, type SubjectStageProps } from './SubjectStage';
export { PhotoStage, type PhotoStageProps } from './PhotoStage';
export { RedactedPlay, splitRedacted, type RedactedPlayProps } from './RedactedPlay';
export { StatTable, type StatTableProps } from './StatTable';
export { TriviaStack, type TriviaStackProps } from './TriviaStack';
export { CareerTimeline, type CareerTimelineProps } from './CareerTimeline';
export { ClueRail, type ClueRailProps } from './ClueRail';
export { TryLadder, rungStatuses, type TryLadderProps } from './TryLadder';
export { GuessBox, skipLabel, type GuessBoxProps } from './GuessBox';
export { Feedback, closeCopy, verdictLine, type CloseCopy, type FeedbackProps } from './Feedback';
export { TopBar, type TopBarProps } from './TopBar';
export { BlitzClock, BLITZ_DANGER_MS, type BlitzClockProps } from './BlitzClock';
export { BlitzFlash, BLITZ_FLASH_MS, type BlitzFlashProps } from './BlitzFlash';
export { SurvivalRail, type SurvivalRailProps } from './SurvivalRail';
export { FranchiseBoard, franchiseStates, type FranchiseBoardProps, type FranchiseState } from './FranchiseBoard';
export { SeatBar, type SeatBarProps } from './SeatBar';
export { HandoverCard, type HandoverCardProps } from './HandoverCard';
export { ChoiceActions, type ChoiceActionsProps } from './ChoiceActions';
export {
  BLITZ_PENALTY_SECONDS,
  SCOUT_FORMAT_ACCENT,
  SURVIVAL_TIER_CHIPS,
  SURVIVAL_TIER_COPY,
  pickedCardIds,
  scoutOutcome,
  type ScoutOutcome,
} from './formatCopy';
export { RevealCard, breakdownFor, isLastRound, streakBefore, type RevealCardProps } from './RevealCard';
export { WatchTape, TAPE_CAVEAT, tapeEmbedUrl, type WatchTapeProps } from './WatchTape';
export {
  YT_API_SRC,
  YT_API_TIMEOUT_MS,
  isEmbedBlocked,
  loadYouTubeApi,
  posterUrl,
  watchUrl,
  type YtErrorCode,
  type YtNamespace,
  type YtPlayer,
} from './youtubeApi';
export { NoSession } from './NoSession';
export { QuitDialog, type QuitDialogProps } from './QuitDialog';
export { HotkeysHelp, hotkeyRows, type HotkeysHelpProps } from './HotkeysHelp';
export { useScoutClips } from './useScoutClips';
export { useScoutClock, TICK_MS } from './useScoutClock';
export {
  useScoutSuggestions,
  loadSuggestionPools,
  suggestionPool,
  type ScoutSuggestions,
} from './useScoutSuggestions';
export {
  ScoutPoolError,
  clearScoutStartError,
  loadScoutGame,
  startLoadedScoutGame,
  startScoutGame,
  useScoutStarting,
  type LoadedScoutGame,
  type ScoutAnswer,
  type ScoutDevHandle,
  type ScoutPoolReason,
} from './startScoutGame';
export { useFinishScoutGame, isDiscardedScoutGame, scoutAttempted } from './useFinishScoutGame';
export { SessionPanel, type SessionPanelProps } from './SessionPanel';
export { ResultsHero, scoutHeadline, sessionLine, type ResultsHeroProps } from './ResultsHero';
export { RoundList, type RoundListProps } from './RoundList';
export { Scoreboard, type ScoreboardProps } from './Scoreboard';
export { FormatOutcome, type FormatOutcomeProps } from './FormatOutcome';
export { ProgressionCard, type ProgressionCardProps } from './ProgressionCard';
export {
  ResultActions,
  challengeSubjectKeys,
  scoutChallengeText,
  scoutShareText,
  type ResultActionsProps,
} from './ResultActions';
export { SilhouetteSample, type SilhouetteSampleProps } from './SilhouetteSample';
