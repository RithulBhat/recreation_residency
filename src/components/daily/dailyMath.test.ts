import { describe, expect, it } from 'vitest';
import { addDays, dailyStreak, dayOfMonth, formatCountdown, lastNDays, msUntilMidnight } from './dailyMath';

describe('dailyMath', () => {
  it('adds days across month and year boundaries', () => {
    expect(addDays('2026-09-26', 1)).toBe('2026-09-27');
    expect(addDays('2026-10-01', -1)).toBe('2026-09-30');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
  });

  it('lists the last N days oldest first', () => {
    const days = lastNDays('2026-09-26', 3);
    expect(days).toEqual(['2026-09-24', '2026-09-25', '2026-09-26']);
    expect(lastNDays('2026-09-26', 14)).toHaveLength(14);
    expect(dayOfMonth('2026-09-05')).toBe(5);
  });

  it('counts the streak ending today, or yesterday while today is pending', () => {
    const played = new Set(['2026-09-24', '2026-09-25', '2026-09-26']);
    expect(dailyStreak(played, '2026-09-26')).toBe(3);
    expect(dailyStreak(new Set(['2026-09-24', '2026-09-25']), '2026-09-26')).toBe(2);
    expect(dailyStreak(new Set(['2026-09-20']), '2026-09-26')).toBe(0);
    expect(dailyStreak(new Set(), '2026-09-26')).toBe(0);
  });

  it('formats the midnight countdown', () => {
    expect(formatCountdown(0)).toBe('00:00:00');
    expect(formatCountdown(3_723_000)).toBe('01:02:03');
    const now = new Date(2026, 8, 26, 23, 59, 30);
    expect(msUntilMidnight(now)).toBe(30_000);
  });
});
