import { describe, expect, it } from 'vitest';
import { formatCompact, formatValue, group, relativeError, unitSpec } from './units';

describe('group', () => {
  it('inserts thousands separators', () => {
    expect(group(0)).toBe('0');
    expect(group(999)).toBe('999');
    expect(group(1000)).toBe('1,000');
    expect(group(340003797)).toBe('340,003,797');
  });

  it('handles negatives and keeps at most two decimals', () => {
    expect(group(-1234)).toBe('-1,234');
    expect(group(1234.5)).toBe('1,234.5');
    expect(group(1234.567)).toBe('1,234.57');
  });
});

describe('formatValue', () => {
  it('renders currency with a prefix and no decimals', () => {
    expect(formatValue(1299, 'usd')).toBe('$1,299');
    expect(formatValue(1299, 'gbp')).toBe('£1,299');
    expect(formatValue(2_000_000, 'eur')).toBe('€2,000,000');
  });

  it('renders suffixed units', () => {
    expect(formatValue(340003797, 'people')).toBe('340,003,797 people');
    expect(formatValue(606410, 'sqkm')).toBe('606,410 km²');
    expect(formatValue(315, 'pounds')).toBe('315 lb');
    expect(formatValue(76, 'inches')).toBe('76"');
  });

  it('leaves years ungrouped-looking but exact', () => {
    expect(formatValue(2001, 'year')).toBe('2,001');
  });

  it('never renders a non-finite value as a number', () => {
    expect(formatValue(Infinity, 'usd')).toBe('—');
    expect(formatValue(NaN, 'people')).toBe('—');
  });
});

describe('formatCompact', () => {
  it('shortens large numbers with one decimal below 100', () => {
    expect(formatCompact(1299, 'usd')).toBe('$1.3K');
    expect(formatCompact(340003797, 'people')).toBe('340M people');
    expect(formatCompact(1_179_121_535_535, 'usd')).toBe('$1.2T');
  });

  it('drops the decimal when it would read as .0', () => {
    expect(formatCompact(2000, 'count')).toBe('2K');
  });

  it('falls back to exact for units that must not be abbreviated', () => {
    expect(formatCompact(2001, 'year')).toBe('2,001');
    expect(formatCompact(315, 'pounds')).toBe('315 lb');
  });

  it('leaves values below a thousand alone', () => {
    expect(formatCompact(999, 'usd')).toBe('$999');
  });
});

describe('relativeError', () => {
  it('is zero for an exact guess', () => {
    expect(relativeError(100, 100)).toBe(0);
  });

  it('is symmetric in direction', () => {
    expect(relativeError(90, 100)).toBeCloseTo(0.1);
    expect(relativeError(110, 100)).toBeCloseTo(0.1);
  });

  it('treats a zero answer as unscaleable unless the guess is also zero', () => {
    expect(relativeError(0, 0)).toBe(0);
    expect(relativeError(5, 0)).toBe(Infinity);
  });

  it('rejects non-finite input rather than producing NaN', () => {
    expect(relativeError(NaN, 100)).toBe(Infinity);
  });
});

describe('unitSpec', () => {
  it('marks years and body measurements as non-compactable', () => {
    expect(unitSpec('year').compactable).toBe(false);
    expect(unitSpec('pounds').compactable).toBe(false);
    expect(unitSpec('usd').compactable).toBe(true);
  });
});
