import { describe, expect, it } from 'vitest';
import { DOUBLE_TAP_MS, createTapGuard } from './tapGuard';

describe('createTapGuard', () => {
  it('flags a second tap inside the window and lets a later one through', () => {
    let t = 1000;
    const guard = createTapGuard(DOUBLE_TAP_MS, () => t);
    expect(guard.isRecent()).toBe(false);
    guard.mark();
    t += 100;
    expect(guard.isRecent()).toBe(true);
    t += 149;
    expect(guard.isRecent()).toBe(true);
    t += 1;
    expect(guard.isRecent()).toBe(false);
  });

  it('reset forgets the last play', () => {
    let t = 0;
    const guard = createTapGuard(250, () => t);
    guard.mark();
    guard.reset();
    t += 10;
    expect(guard.isRecent()).toBe(false);
  });
});
