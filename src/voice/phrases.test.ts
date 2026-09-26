import { describe, expect, it } from 'vitest';
import type { HostEvent, HostPersonality } from '@/types/voice';
import {
  HOST_PLACEHOLDERS,
  PHRASES,
  RECENT_MEMORY,
  fillTemplate,
  pickLine,
  placeholdersIn,
  speakClipLength,
  templateValuesFor,
  type HostEventKind,
  type HostTemplateValues,
} from './phrases';

const PERSONALITIES: readonly HostPersonality[] = ['hype', 'chill', 'savage', 'radio'];

const SAMPLE_EVENTS: ReadonlyArray<HostEvent> = [
  { kind: 'gameStart', mode: 'classic', packName: '2000s Bangers', clipLength: 0.1 },
  { kind: 'roundStart', round: 3, total: 10, clipLength: 0.5, playerName: 'Maanu' },
  { kind: 'correct', title: 'Africa', artist: 'Toto', tryIndex: 0, clipLength: 0.1, streak: 4 },
  { kind: 'partial', artist: 'Toto' },
  { kind: 'wrong', tryIndex: 1, triesLeft: 2 },
  { kind: 'reveal', title: 'Africa', artist: 'Toto' },
  { kind: 'skip' },
  { kind: 'timeout' },
  { kind: 'buzz', playerName: 'Rithul' },
  { kind: 'gameOver', score: 4820, correct: 7, total: 10, winnerName: 'Maanu' },
  { kind: 'streak', streak: 5 },
  { kind: 'custom', text: 'Anything can happen.' },
];

const ALL_KINDS = SAMPLE_EVENTS.map((e) => e.kind);

const FULL_CONTEXT: HostTemplateValues = {
  title: 'Africa',
  artist: 'Toto',
  clipLength: 'a tenth of a second',
  round: 3,
  total: 10,
  streak: 4,
  score: 4820,
  playerName: 'Maanu',
  triesLeft: 2,
  correct: 7,
  winnerName: 'Rithul',
  packName: '2000s Bangers',
  mode: 'classic',
};

function wordCount(line: string): number {
  return line.trim().split(/\s+/).filter(Boolean).length;
}

describe('phrase bank shape', () => {
  it('covers all 4 personalities', () => {
    expect(Object.keys(PHRASES).sort()).toEqual([...PERSONALITIES].sort());
  });

  for (const personality of PERSONALITIES) {
    for (const kind of ALL_KINDS) {
      it(`${personality}/${kind} has at least 6 distinct lines`, () => {
        const lines = PHRASES[personality][kind as HostEventKind];
        expect(lines.length).toBeGreaterThanOrEqual(6);
        expect(new Set(lines).size).toBe(lines.length);
      });
    }
  }

  it('has an entry for every HostEvent kind', () => {
    for (const personality of PERSONALITIES) {
      const banked = Object.keys(PHRASES[personality]).sort();
      expect(banked).toEqual([...ALL_KINDS].sort());
    }
  });

  it('keeps every line under 14 words', () => {
    for (const personality of PERSONALITIES) {
      for (const kind of ALL_KINDS) {
        for (const line of PHRASES[personality][kind as HostEventKind]) {
          expect(wordCount(line), `${personality}/${kind}: ${line}`).toBeLessThan(14);
        }
      }
    }
  });

  it('only uses known placeholders', () => {
    const known = new Set<string>(HOST_PLACEHOLDERS);
    for (const personality of PERSONALITIES) {
      for (const kind of ALL_KINDS) {
        for (const line of PHRASES[personality][kind as HostEventKind]) {
          for (const key of placeholdersIn(line)) {
            expect(known.has(key), `${line} uses unknown {${key}}`).toBe(true);
          }
        }
      }
    }
  });

  it('uses every documented placeholder somewhere', () => {
    const seen = new Set<string>();
    for (const personality of PERSONALITIES) {
      for (const kind of ALL_KINDS) {
        for (const line of PHRASES[personality][kind as HostEventKind]) {
          for (const key of placeholdersIn(line)) seen.add(key);
        }
      }
    }
    for (const key of HOST_PLACEHOLDERS) expect(seen.has(key), `unused {${key}}`).toBe(true);
  });

  it('every line fills completely from a full context', () => {
    for (const personality of PERSONALITIES) {
      for (const kind of ALL_KINDS) {
        for (const line of PHRASES[personality][kind as HostEventKind]) {
          const filled = fillTemplate(line, FULL_CONTEXT);
          expect(filled, line).not.toContain('{');
          expect(filled, line).not.toContain('}');
          expect(filled.length).toBeGreaterThan(0);
        }
      }
    }
  });
});

describe('fillTemplate', () => {
  it('substitutes values', () => {
    expect(fillTemplate('{title} by {artist}!', { title: 'Africa', artist: 'Toto' })).toBe(
      'Africa by Toto!',
    );
  });

  it('accepts numbers', () => {
    expect(fillTemplate('Round {round} of {total}.', { round: 2, total: 9 })).toBe('Round 2 of 9.');
  });

  it('collapses the gap a missing value leaves behind', () => {
    expect(fillTemplate('{playerName}, you are up!', {})).toBe('you are up!');
    expect(fillTemplate('Nice, {streak} in a row.', {})).toBe('Nice, in a row.');
  });

  it('ignores unknown placeholders rather than leaving braces', () => {
    expect(fillTemplate('hello {nope}', {})).toBe('hello');
  });
});

describe('speakClipLength', () => {
  const cases: ReadonlyArray<readonly [number, string]> = [
    [0.1, 'a tenth of a second'],
    [0.2, 'two tenths of a second'],
    [0.25, 'a quarter of a second'],
    [0.5, 'half a second'],
    [0.75, 'three quarters of a second'],
    [1, 'one second'],
    [1.5, 'a second and a half'],
    [2, 'two seconds'],
    [2.5, 'two and a half seconds'],
    [4, 'four seconds'],
    [7, 'seven seconds'],
    [10, 'ten seconds'],
  ];
  for (const [sec, expected] of cases) {
    it(`${sec}s -> "${expected}"`, () => {
      expect(speakClipLength(sec)).toBe(expected);
    });
  }

  it('falls back for unusual values', () => {
    expect(speakClipLength(1.3)).toBe('1.3 seconds');
    expect(speakClipLength(11)).toBe('11 seconds');
  });

  it('never says "0 seconds"', () => {
    expect(speakClipLength(0)).toBe('a heartbeat');
    expect(speakClipLength(-1)).toBe('a heartbeat');
    expect(speakClipLength(Number.NaN)).toBe('a heartbeat');
  });
});

describe('templateValuesFor', () => {
  it('speaks clip lengths naturally', () => {
    const values = templateValuesFor({
      kind: 'gameStart',
      mode: 'fixed',
      packName: 'Y2K',
      clipLength: 0.5,
    });
    expect(values.clipLength).toBe('half a second');
  });

  it('drops a streak of one so no line brags about it', () => {
    const values = templateValuesFor({
      kind: 'correct',
      title: 'Africa',
      artist: 'Toto',
      tryIndex: 0,
      clipLength: 1,
      streak: 1,
    });
    expect(values.streak).toBeUndefined();
  });
});

describe('pickLine', () => {
  it('fills the event data in', () => {
    for (const personality of PERSONALITIES) {
      const line = pickLine(personality, {
        kind: 'reveal',
        title: 'Africa',
        artist: 'Toto',
      });
      expect(line).toContain('Africa');
      expect(line).toContain('Toto');
      expect(line).not.toContain('{');
    }
  });

  it('never returns a line with an unresolved placeholder', () => {
    for (const personality of PERSONALITIES) {
      for (const event of SAMPLE_EVENTS) {
        for (let i = 0; i < 40; i += 1) {
          const line = pickLine(personality, event);
          expect(line).not.toContain('{');
          expect(line.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it(`avoids the last ${RECENT_MEMORY} lines used for an event`, () => {
    for (const personality of PERSONALITIES) {
      const recent: string[] = [];
      for (let i = 0; i < 60; i += 1) {
        const line = pickLine(personality, { kind: 'skip' }, recent);
        expect(recent.slice(-RECENT_MEMORY)).not.toContain(line);
        recent.push(line);
      }
    }
  });

  it('skips lines whose placeholders the event cannot supply', () => {
    // No playerName on a solo run — no line may start with a dangling comma.
    for (let i = 0; i < 60; i += 1) {
      const line = pickLine('hype', { kind: 'roundStart', round: 1, total: 5, clipLength: 0.1 });
      expect(line.startsWith(',')).toBe(false);
      expect(line).not.toContain('  ');
    }
  });

  it('speaks custom text verbatim', () => {
    expect(pickLine('savage', { kind: 'custom', text: '  Get in the van.  ' })).toBe(
      'Get in the van.',
    );
  });

  it('falls back to personality chatter for an empty custom event', () => {
    const line = pickLine('chill', { kind: 'custom', text: '   ' });
    expect(PHRASES.chill.custom).toContain(line);
  });

  it('uses a different voice per personality', () => {
    const event: HostEvent = { kind: 'timeout' };
    const banks = PERSONALITIES.map((p) => new Set(PHRASES[p][event.kind]));
    for (let i = 0; i < PERSONALITIES.length; i += 1) {
      const line = pickLine(PERSONALITIES[i], event);
      expect(banks[i].has(line)).toBe(true);
    }
  });
});
