import type { HostEvent, HostPersonality } from '@/types/voice';

export type HostEventKind = HostEvent['kind'];

/** Every placeholder a phrase line may use. */
export const HOST_PLACEHOLDERS = [
  'title',
  'artist',
  'clipLength',
  'round',
  'total',
  'streak',
  'score',
  'playerName',
  'triesLeft',
  'correct',
  'winnerName',
  'packName',
  'mode',
] as const;

export type HostPlaceholder = (typeof HOST_PLACEHOLDERS)[number];

export type HostTemplateValues = Partial<Record<HostPlaceholder, string | number | undefined>>;

/** How many recently used lines we refuse to repeat. */
export const RECENT_MEMORY = 3;

const PLACEHOLDER_RE = /\{(\w+)\}/g;

const CLIP_WORDS: Readonly<Record<string, string>> = {
  '0.1': 'a tenth of a second',
  '0.15': 'a hair over a tenth of a second',
  '0.2': 'two tenths of a second',
  '0.25': 'a quarter of a second',
  '0.3': 'three tenths of a second',
  '0.4': 'four tenths of a second',
  '0.5': 'half a second',
  '0.6': 'six tenths of a second',
  '0.7': 'seven tenths of a second',
  '0.75': 'three quarters of a second',
  '0.8': 'eight tenths of a second',
  '0.9': 'nine tenths of a second',
  '1': 'one second',
  '1.5': 'a second and a half',
  '2': 'two seconds',
  '2.5': 'two and a half seconds',
  '3': 'three seconds',
  '3.5': 'three and a half seconds',
  '4': 'four seconds',
  '5': 'five seconds',
  '6': 'six seconds',
  '7': 'seven seconds',
  '8': 'eight seconds',
  '9': 'nine seconds',
  '10': 'ten seconds',
  '12': 'twelve seconds',
  '15': 'fifteen seconds',
  '20': 'twenty seconds',
  '30': 'thirty seconds',
};

/**
 * Speak a clip length the way a human would say it.
 * `0.1` -> "a tenth of a second", `0.5` -> "half a second", `2` -> "two seconds".
 */
export function speakClipLength(sec: number): string {
  if (typeof sec !== 'number' || !Number.isFinite(sec) || sec <= 0) return 'a heartbeat';
  const exact = CLIP_WORDS[String(Math.round(sec * 100) / 100)];
  if (exact !== undefined) return exact;
  const tenth = Math.round(sec * 10) / 10;
  const near = CLIP_WORDS[String(tenth)];
  if (near !== undefined) return near;
  if (Number.isInteger(tenth)) return `${tenth} seconds`;
  return `${tenth} seconds`;
}

/** Tidy the gaps a missing placeholder leaves behind. */
function tidySpeech(input: string): string {
  return input
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.!?;:])/g, '$1')
    .replace(/([,;:])\s*(?=[,.!?;:])/g, '')
    .replace(/^[\s,;:.!?-]+/, '')
    .trim();
}

/** Substitute `{placeholder}` values; unknown or missing values collapse away. */
export function fillTemplate(line: string, values: HostTemplateValues = {}): string {
  const filled = line.replace(PLACEHOLDER_RE, (_match, key: string) => {
    const value = values[key as HostPlaceholder];
    if (value === undefined || value === null) return '';
    return String(value);
  });
  return tidySpeech(filled);
}

/** Placeholders referenced by a line, in order of appearance. */
export function placeholdersIn(line: string): string[] {
  const found: string[] = [];
  for (const match of line.matchAll(PLACEHOLDER_RE)) {
    if (match[1] !== undefined) found.push(match[1]);
  }
  return found;
}

/** Map a host event onto template values. Optional fields stay `undefined`. */
export function templateValuesFor(event: HostEvent): HostTemplateValues {
  switch (event.kind) {
    case 'gameStart':
      return {
        mode: event.mode,
        packName: event.packName,
        clipLength: speakClipLength(event.clipLength),
      };
    case 'roundStart':
      return {
        round: event.round,
        total: event.total,
        clipLength: speakClipLength(event.clipLength),
        playerName: event.playerName,
      };
    case 'correct':
      return {
        title: event.title,
        artist: event.artist,
        clipLength: speakClipLength(event.clipLength),
        // A "streak" of 0 or 1 is not worth bragging about — drop those lines.
        streak: event.streak >= 2 ? event.streak : undefined,
      };
    case 'partial':
      return { artist: event.artist };
    case 'wrong':
      return { triesLeft: event.triesLeft };
    case 'reveal':
      return { title: event.title, artist: event.artist };
    case 'skip':
    case 'timeout':
    case 'custom':
      return {};
    case 'buzz':
      return { playerName: event.playerName };
    case 'gameOver':
      return {
        score: event.score,
        correct: event.correct,
        total: event.total,
        winnerName: event.winnerName,
      };
    case 'streak':
      return { streak: event.streak };
  }
}

/** True when every placeholder the line needs has a usable value. */
function lineFits(line: string, values: HostTemplateValues): boolean {
  for (const key of placeholdersIn(line)) {
    const value = values[key as HostPlaceholder];
    if (value === undefined || value === null || String(value).trim().length === 0) return false;
  }
  return true;
}

type Bank = Readonly<Record<HostEventKind, readonly string[]>>;

const HYPE: Bank = {
  gameStart: [
    "{packName}! {mode} mode! Let's absolutely demolish this!",
    'Welcome to Songooner! {clipLength} of pure chaos!',
    'Oh, we are COOKING tonight. {packName}, here we go!',
    '{mode} mode, baby! Hands on the buzzer!',
    "{clipLength}. That's all you get. Good luck, legend!",
    'Lights up! {packName} is in the building!',
  ],
  roundStart: [
    'Round {round} of {total}! Here comes {clipLength}!',
    'Song {round}! Ears open! {clipLength}!',
    "{playerName}, you're up! {clipLength} on the clock!",
    'Round {round}! I can already feel the greatness!',
    'Here we GO! {clipLength} and not a millisecond more!',
    "Number {round} of {total}. Don't blink!",
  ],
  correct: [
    '{title}! YES! Off {clipLength}! Unbelievable!',
    "{artist}! Nailed it! That's {streak} in a row!",
    'CORRECT! {title}! Somebody call a doctor!',
    '{title} by {artist}! You are unstoppable!',
    "From {clipLength}?! That's witchcraft! {title}!",
    'BOOM! {title}! Streak of {streak}!',
  ],
  partial: [
    '{artist}! Right artist! Now give me that title!',
    '{artist} is correct! Half credit, keep digging!',
    "SO close! You've got {artist}, find the song!",
    '{artist}, yes! The title though! Come on!',
    'Artist locked! {artist}! Title still missing!',
    'Ooh! {artist} is right! Halfway to glory!',
  ],
  wrong: [
    'NOPE! {triesLeft} left! Shake it off!',
    "Not it! You've still got {triesLeft}! Breathe!",
    'Swing and a miss! {triesLeft} to go!',
    'Oh! So confident, so wrong! {triesLeft} left!',
    'Denied! {triesLeft} remaining! Dig deeper!',
    'Wrong, but gloriously wrong! {triesLeft} left!',
  ],
  reveal: [
    'It was {title} by {artist}! Ohhh!',
    '{title}! {artist}! That one hurt, huh?',
    'The answer: {title}, by {artist}! Brutal!',
    '{artist} had you! The track was {title}!',
    'Reveal time! {title} by {artist}! Write that down!',
    '{title} by {artist}. Remember that name!',
  ],
  skip: [
    'Skipped! Cowardly, but strategic! Next!',
    'Away it goes! Moving on!',
    'Skip! No shame, only speed!',
    "We're bailing! Next track, go!",
    'Skipped it! Respect the hustle!',
    'Gone! Next! Keep the energy up!',
  ],
  timeout: [
    'TIME! The clock has no mercy!',
    'Out of time! That buzzer is brutal!',
    "Time's up! The clock wins that one!",
    'Too slow! The seconds ate you alive!',
    'TIMEOUT! Somebody wind that clock back!',
    'Clock says no! Onwards!',
  ],
  buzz: [
    '{playerName} is IN! Talk to me!',
    'BUZZ! {playerName} slams it! Go!',
    '{playerName}! Fastest hands in the room!',
    'Oh! {playerName} is feeling brave! Speak!',
    '{playerName} beat everyone! The floor is yours!',
    'BUZZER! {playerName}! Say something amazing!',
  ],
  gameOver: [
    '{correct} of {total}! {score} points! WHAT A RUN!',
    '{winnerName} takes it! {score} points of glory!',
    'Final score {score}! You beautiful maniac!',
    "That's game! {correct} out of {total}! Incredible!",
    '{winnerName} is the champion! {score} points!',
    'Scoreboard says {score}! I need to sit down!',
  ],
  streak: [
    '{streak} IN A ROW! Someone stop this person!',
    'STREAK OF {streak}! The room is shaking!',
    "{streak} straight! You're on fire, genuinely!",
    "That's {streak}! I'm running out of adjectives!",
    '{streak} back to back! Absolute heater!',
    'Streak {streak}! Do not stop now!',
  ],
  custom: [
    "Let's go!",
    'Oh, this is good!',
    'I love this game!',
    'Keep it rolling!',
    'Turn it up!',
    'Big energy! Big energy!',
  ],
};

const CHILL: Bank = {
  gameStart: [
    'Easy now. {packName}, {mode} mode. Settle in.',
    'Welcome in. {clipLength} per track. No rush.',
    "Dim the lights. We're playing {packName} tonight.",
    "{mode} mode, smooth and simple. Let's drift.",
    'You get {clipLength}. Breathe, then guess.',
    "{packName} on the turntable. Whenever you're ready.",
  ],
  roundStart: [
    'Round {round} of {total}. Take your time.',
    "Here's {clipLength}. Let it wash over you.",
    "{playerName}, this one's yours. No pressure.",
    'Track {round}. Nice and easy.',
    '{clipLength} coming up. Close your eyes.',
    'Number {round} of {total}. Smooth sailing.',
  ],
  correct: [
    '{title}. Mm. Very nice.',
    'Yeah, {artist}. You heard that clean.',
    '{title}. Off {clipLength}. Respect.',
    'Correct. {streak} in a row. Cool.',
    '{artist}, exactly. That was effortless.',
    '{title}. Silky. Next one.',
  ],
  partial: [
    "{artist} is right. The title's still floating.",
    'Half there. {artist}, good ear.',
    'You got {artist}. Sit with it a second.',
    '{artist}, yes. The name will come.',
    'Close. {artist} is your anchor.',
    "Artist's good. {artist}. Keep listening.",
  ],
  wrong: [
    "Not quite. {triesLeft} left. It's fine.",
    'Nope. {triesLeft} to go. Relax.',
    'Missed it. {triesLeft} remaining. No stress.',
    'Mm, no. {triesLeft} still in the tank.',
    'Not that one. {triesLeft} left, easy.',
    'Wrong turn. {triesLeft} to go. Breathe.',
  ],
  reveal: [
    'That was {title}, by {artist}. Lovely track.',
    '{title}. {artist}. One for the playlist.',
    'The answer was {title}, from {artist}.',
    '{artist} did that one. {title}.',
    "It's {title} by {artist}. Worth a relisten, honestly.",
    '{title} by {artist}. Now you know.',
  ],
  skip: [
    'Skipped. No harm done.',
    'Letting that one go. Fine by me.',
    'Passed. On to the next groove.',
    "Skip it. Life's short.",
    'We move. Next track.',
    'Gone. No hard feelings.',
  ],
  timeout: [
    'Time drifted away on that one.',
    'Clock ran out. It happens.',
    'Out of time. No big deal.',
    "Time's gone. Let's keep gliding.",
    'Ran the clock down. Next.',
    "That's time. Easy come, easy go.",
  ],
  buzz: [
    '{playerName} steps in. Go ahead.',
    '{playerName} has it. Take your time.',
    "Buzz. {playerName}. Floor's yours.",
    "{playerName} felt something. Let's hear it.",
    'Alright, {playerName}. Speak freely.',
    '{playerName} first. Nice reflexes.',
  ],
  gameOver: [
    '{correct} of {total}. {score} points. Solid.',
    '{winnerName} takes it. Smooth work.',
    'Final: {score}. That was a nice set.',
    '{correct} out of {total}. Tidy little run.',
    '{winnerName} wins with {score}. Well played.',
    "We'll leave it at {score}. Good night.",
  ],
  streak: [
    '{streak} in a row. Quietly impressive.',
    'Streak of {streak}. Very smooth.',
    "{streak} straight. You're in the pocket.",
    "That's {streak}. Barely breaking a sweat.",
    '{streak} clean. Keep that rhythm.',
    'Nice. {streak} without a stumble.',
  ],
  custom: [
    'Mm.',
    'Nice and easy.',
    'Yeah, I feel that.',
    'Smooth.',
    "We're vibing.",
    'Take your time.',
  ],
};

const SAVAGE: Bank = {
  gameStart: [
    '{packName}, {mode} mode. Try not to embarrass yourself.',
    '{clipLength} per song. This will be painful.',
    'Welcome. My expectations are on the floor.',
    "{packName}. Let's see how bad this gets.",
    "{mode} mode. I've already written your obituary.",
    '{clipLength}. Your parents are watching. Somehow.',
  ],
  roundStart: [
    'Round {round} of {total}. Please, dazzle me.',
    "{clipLength}. You can't blame the audio this time.",
    '{playerName}, your turn to disappoint us.',
    "Track {round}. I'm bracing for impact.",
    "{clipLength} coming. Don't overthink it. Or think.",
    'Round {round} of {total}. Miracles welcome.',
  ],
  correct: [
    '{title}. Fine. You got one. Calm down.',
    'Correct. {artist}. Broken clocks, twice a day.',
    '{title} off {clipLength}? Suspicious. Deeply suspicious.',
    'Right. {streak} in a row. Show-off.',
    '{artist}. Wow. Did someone help you?',
    "{title}. I'll allow it. Barely.",
  ],
  partial: [
    '{artist}. Half a brain, half a point.',
    'You got {artist}. The easy half. Congrats.',
    '{artist}, sure. The title? Still missing.',
    'Artist right, title nowhere. Classic.',
    '{artist}. Now do the hard part.',
    'Halfway there, which is also halfway wrong.',
  ],
  wrong: [
    'No. {triesLeft} more chances to be wrong.',
    'Wildly incorrect. {triesLeft} left, somehow.',
    'That was a choice. {triesLeft} remaining.',
    'Wrong. {triesLeft} left. Lower your expectations.',
    'Nope. {triesLeft} to go. I believe in nothing.',
    'Incorrect, confidently. {triesLeft} to go.',
  ],
  reveal: [
    'It was {title} by {artist}. Obviously.',
    '{title}. {artist}. Everyone knew but you.',
    'The answer was {title} by {artist}. Write it down. Please.',
    '{artist}, {title}. That one was free.',
    "{title} by {artist}. A child would've got that.",
    '{artist} made {title}. Now you know. Finally.',
  ],
  skip: [
    'Skipping. Bold admission of defeat.',
    'Running away. Understandable.',
    'Skipped. We all saw that coming.',
    "Coward's exit. Next.",
    'Gone. Your dignity went with it.',
    'Skip. Honestly, merciful for everyone.',
  ],
  timeout: [
    'Out of time. Were you napping?',
    "Time's up. Thinking is hard, apparently.",
    "The clock beat you. It wasn't even trying.",
    'Timeout. That silence was deafening.',
    'You ran out of time and ideas.',
    'Time. Gone. Like your chances.',
  ],
  buzz: [
    '{playerName} buzzed. This should be fun.',
    'Oh, {playerName} thinks they know. Adorable.',
    '{playerName} in first. Fast, not right.',
    "{playerName}! Bold. Let's hear the damage.",
    'Buzzer. {playerName}. Please be good.',
    '{playerName} beat the others to being wrong.',
  ],
  gameOver: [
    "{correct} of {total}. {score} points. We've seen worse.",
    '{winnerName} wins. Low bar, but a win.',
    'Final score {score}. Frame it, I guess.',
    "{correct} out of {total}. Statistically, that's a tragedy.",
    '{winnerName} takes it with {score}. Barely.',
    '{score} points. Your headphones deserve better.',
  ],
  streak: [
    '{streak} in a row. Who are you?',
    'Streak of {streak}. Did you cheat?',
    "{streak} straight. I don't trust this.",
    "That's {streak}. Enjoy it while it lasts.",
    '{streak} correct. The universe is broken.',
    'Fine. {streak} in a row. Fine.',
  ],
  custom: ['Hmph.', 'Sure. Why not.', 'Fascinating.', "Oh, we're doing this.", 'Noted.', 'Bold.'],
};

const RADIO: Bank = {
  gameStart: [
    "Good evening! You're locked into Songooner. Tonight: {packName}.",
    'Coming up: {mode} mode, {clipLength} a track.',
    "You're on the air. {packName}, top to bottom.",
    'This is Songooner. {clipLength} per song. Stay tuned.',
    "Broadcasting live! {mode} mode. Let's spin.",
    'First up tonight: {packName}. Hands on the dial.',
  ],
  roundStart: [
    'Round {round} of {total}. Rolling tape now.',
    'Cueing up {clipLength}. Listen close.',
    "{playerName}, you're on the air.",
    'Next on the playlist: number {round}.',
    '{clipLength}, straight off the needle. Here it comes.',
    "Track {round} of {total}. And we're live.",
  ],
  correct: [
    'Correct! {title}, a certified classic.',
    '{artist}! Straight up the charts!',
    '{title}, off just {clipLength}. Golden ears!',
    "That's a hit! {streak} in a row!",
    '{artist}, confirmed. Put it on the record.',
    '{title}! Dedications are pouring in!',
  ],
  partial: [
    '{artist} is correct! Now the title, please.',
    'Half the credit: {artist}. Keep going.',
    "You've got the artist, {artist}. Title next.",
    '{artist}, yes! The track name eludes you.',
    'Partial credit for {artist}. Nearly there.',
    'Artist confirmed: {artist}. Title pending.',
  ],
  wrong: [
    'Afraid not. {triesLeft} remaining.',
    'Not tonight. {triesLeft} left on the clock.',
    'Incorrect! {triesLeft} more spins.',
    'No dice. {triesLeft} to go.',
    "That's a miss. {triesLeft} remaining.",
    'Negative. {triesLeft} left, folks.',
  ],
  reveal: [
    'The answer: {title}, by {artist}.',
    'That was {artist} with {title}.',
    'For the record: {title}. {artist}.',
    '{title}, from the one and only {artist}.',
    'Straight from the archives: {artist}, {title}.',
    'And that, friends, was {title} by {artist}.',
  ],
  skip: [
    'Skipping ahead. Next on the dial.',
    "We'll let that one spin away.",
    'Moving down the playlist. Stay with us.',
    'Skipped! On to the next cut.',
    'Next record, please.',
    "We'll pass on that one. Onwards.",
  ],
  timeout: [
    "And that's time, ladies and gentlemen.",
    "The clock has spoken. Time's up.",
    'Out of time! We move along.',
    'Time expired. Back to the playlist.',
    "That's the buzzer. No answer logged.",
    "Clock's done. Next selection.",
  ],
  buzz: [
    '{playerName} on the line! Go ahead.',
    "We have {playerName}! You're live.",
    '{playerName} rings in first. Speak up.',
    'Caller {playerName}, the mic is yours.',
    '{playerName} beat the buzzer! Talk to me.',
    'First in: {playerName}. On the air.',
  ],
  gameOver: [
    '{correct} of {total}. Final tally: {score} points.',
    '{winnerName} tops the charts tonight!',
    "That's our show! {score} points in the books.",
    'Signing off: {correct} out of {total}.',
    '{winnerName} takes the crown with {score}.',
    'Final numbers: {score}. Thanks for tuning in.',
  ],
  streak: [
    '{streak} in a row! A hot streak, folks!',
    "That's {streak} straight, climbing fast!",
    '{streak} without a miss. Remarkable listening.',
    'Streak of {streak}! The lines are lighting up!',
    '{streak} consecutive hits! Turn it up!',
    "{streak} in a row! Somebody's got golden ears.",
  ],
  custom: [
    'Stay tuned.',
    'Back in a moment.',
    "You're listening to Songooner.",
    'Keep it right here.',
    "Don't touch that dial.",
    "And we're rolling.",
  ],
};

export const PHRASES: Readonly<Record<HostPersonality, Bank>> = {
  hype: HYPE,
  chill: CHILL,
  savage: SAVAGE,
  radio: RADIO,
};

/**
 * Pick a filled line for an event.
 *
 * - `custom` events with text speak that text verbatim.
 * - lines whose placeholders the event can't supply are skipped
 *   (so a soloist never hears "{playerName}, you're up!").
 * - the last `RECENT_MEMORY` lines in `recent` are avoided; `recent` may hold
 *   either raw templates or already-filled strings.
 */
export function pickLine(
  personality: HostPersonality,
  event: HostEvent,
  recent: string[] = [],
): string {
  if (event.kind === 'custom') {
    const text = event.text.trim();
    if (text.length > 0) return text;
  }

  const values = templateValuesFor(event);
  const bank = PHRASES[personality][event.kind];
  const fitting = bank.filter((line) => lineFits(line, values));
  const pool = fitting.length > 0 ? fitting : bank;

  const blocked = new Set(recent.slice(-RECENT_MEMORY));
  const fresh = pool.filter((line) => !blocked.has(line) && !blocked.has(fillTemplate(line, values)));
  const choices = fresh.length > 0 ? fresh : pool;

  const chosen = choices[Math.floor(Math.random() * choices.length)] ?? choices[0] ?? '';
  return fillTemplate(chosen, values);
}
