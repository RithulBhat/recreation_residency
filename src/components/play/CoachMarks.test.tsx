import { describe, expect, it } from 'vitest';
import { normalizeSettings } from '@/game/presets';
import { coachSteps } from './CoachMarks';

describe('coachSteps', () => {
  it('speaks in the run’s real clip lengths', () => {
    const classic = coachSteps(normalizeSettings({ mode: 'classic', clipMode: 'escalating', stages: [0.1, 0.3, 1, 2, 4, 7, 10] }));
    expect(classic[0].body).toContain('You get 0.1s of the song');
    expect(classic[2].title).toBe('Skip grows the clip');
    expect(classic[2].body).toContain('0.1s → 0.3s → 1s…');

    const fixed = coachSteps(normalizeSettings({ mode: 'fixed', clipMode: 'fixed', clipLength: 2, tries: 3 }));
    expect(fixed[0].body).toContain('You get 2s of the song');
    expect(fixed[2].title).toBe('Skip burns a try');
    expect(fixed[2].body).toContain('Same 2s clip');

    const oneShot = coachSteps(normalizeSettings({ mode: 'fixed', clipMode: 'fixed', clipLength: 1, tries: 1 }));
    expect(oneShot[2].title).toBe('One shot per song');
  });

  it('points each step at something on screen', () => {
    for (const step of coachSteps(normalizeSettings({ mode: 'classic' }))) expect(step.target).toMatch(/^\[data-coach=/);
  });
});
