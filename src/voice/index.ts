export { cleanTranscript } from './cleanup';
export { createRecognizer, friendlyRecognitionError, type RecognizerOptions, type RecognizerHandlers } from './recognizer';
export {
  PHRASES,
  HOST_PLACEHOLDERS,
  RECENT_MEMORY,
  fillTemplate,
  pickLine,
  placeholdersIn,
  speakClipLength,
  templateValuesFor,
  type HostEventKind,
  type HostPlaceholder,
  type HostTemplateValues,
} from './phrases';
export {
  createVoiceHost,
  pickDefaultVoice,
  HOST_TUNING,
  MAX_PENDING,
  PREFERRED_VOICE_NAMES,
  type VoiceHostController,
  type VoiceHostOptions,
} from './host';
export { useVoiceGuess, type UseVoiceGuess, type UseVoiceGuessOptions } from './useVoiceGuess';
export { useVoiceHost, type UseVoiceHost, type UseVoiceHostOptions } from './useVoiceHost';
export { MicButton, type MicButtonProps } from '@/components/MicButton';
export { HostBubble, type HostBubbleProps } from '@/components/HostBubble';
