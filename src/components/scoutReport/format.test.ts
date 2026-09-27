import { describe, expect, it } from 'vitest';
import { scoutTeamHeatmap, type ScoutCut, type ScoutFormPoint, type ScoutTeamHeat } from '@/scout/report';
import { emptyScoutTotals } from '@/scout/scoutStats';
import {
  barWidth,
  drillTarget,
  cutBand,
  cutExtremes,
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

function cut(key: string, seen: number, correct: number): ScoutCut {
  return {
    key,
    short: key,
    label: key,
    emoji: '🏈',
    seen,
    correct,
    accuracy: seen === 0 ? 0 : correct / seen,
    avgRung: correct === 0 ? 0 : 2,
  };
}

function heat(over: Partial<ScoutTeamHeat> = {}): ScoutTeamHeat {
  return {
    teamId: '12',
    abbr: 'KC',
    name: 'Kansas City Chiefs',
    city: 'Kansas City',
    emoji: '🏹',
    accent: '#e31837',
    conference: 'AFC',
    division: 'West',
    divisionKey: 'AFC West',
    seen: 8,
    correct: 6,
    accuracy: 0.75,
    heat: 1,
    ...over,
  };
}

function point(accuracy: number, i = 0): ScoutFormPoint {
  return {
    runId: `r${i}`,
    at: 1_000 + i,
    format: 'standard',
    mode: 'silhouette',
    score: 1_000,
    rounds: 10,
    correct: Math.round(accuracy * 10),
    accuracy,
    clean: accuracy === 1,
  };
}

describe('pct', () => {
  it('rounds to whole percent and clamps to 0..1', () => {
    expect(pct(0.824)).toBe('82%');
    expect(pct(0)).toBe('0%');
    expect(pct(1)).toBe('100%');
    expect(pct(1.4)).toBe('100%');
    expect(pct(-0.2)).toBe('0%');
  });

  it('keeps digits when asked, and refuses non-numbers', () => {
    expect(pct(0.8249, 1)).toBe('82.5%');
    expect(pct(Number.NaN)).toBe('—');
    expect(pct(Number.POSITIVE_INFINITY)).toBe('—');
  });
});

describe('cutBand', () => {
  it('calls anything under the sample floor thin, however good it looks', () => {
    expect(cutBand(cut('QB', 5, 5))).toBe('thin');
    expect(cutBand(cut('QB', 0, 0))).toBe('thin');
    // the floor is a parameter, not a constant
    expect(cutBand(cut('QB', 5, 5), 4)).toBe('elite');
  });

  it('bands an eligible cut by accuracy', () => {
    expect(cutBand(cut('QB', 10, 9))).toBe('elite');
    expect(cutBand(cut('QB', 10, 8))).toBe('elite');
    expect(cutBand(cut('QB', 10, 7))).toBe('solid');
    expect(cutBand(cut('QB', 10, 6))).toBe('even');
    expect(cutBand(cut('QB', 10, 4))).toBe('shaky');
    expect(cutBand(cut('QB', 10, 2))).toBe('blind');
  });
});

describe('cutExtremes', () => {
  const cuts = [cut('QB', 10, 9), cut('WR', 10, 5), cut('DB', 10, 1), cut('ST', 2, 2)];

  it('names the best and worst cut that have a real sample', () => {
    const { best, worst } = cutExtremes(cuts);
    expect(best?.key).toBe('QB');
    expect(worst?.key).toBe('DB');
  });

  it('never picks a thin cut, even a perfect one', () => {
    const { best, worst } = cutExtremes([cut('ST', 3, 3), cut('WR', 8, 4)]);
    expect(best?.key).toBe('WR');
    expect(worst).toBeNull();
  });

  it('breaks ties on sample size', () => {
    const { best } = cutExtremes([cut('QB', 8, 4), cut('WR', 20, 10)]);
    expect(best?.key).toBe('WR');
  });

  it('returns nothing at all when no cut qualifies', () => {
    expect(cutExtremes([cut('QB', 1, 1), cut('WR', 0, 0)])).toEqual({ best: null, worst: null });
  });

  it('will not call one lone cut both the best and the worst', () => {
    const { best, worst } = cutExtremes([cut('QB', 9, 5), cut('WR', 2, 0)]);
    expect(best?.key).toBe('QB');
    expect(worst).toBeNull();
  });
});

describe('barWidth', () => {
  it('is zero only at zero, and keeps a sliver for anything above it', () => {
    expect(barWidth(0)).toBe(0);
    expect(barWidth(-1)).toBe(0);
    expect(barWidth(0.01)).toBeCloseTo(0.035);
    expect(barWidth(0.5)).toBe(0.5);
    expect(barWidth(2)).toBe(1);
    expect(barWidth(Number.NaN)).toBe(0);
  });
});

describe('teamTintStyle', () => {
  it('leaves a never-scouted cell untinted', () => {
    expect(teamTintStyle(heat({ seen: 0, correct: 0, accuracy: 0 }))).toEqual({});
  });

  it('mixes the club colour in, and harder the better you know them', () => {
    const cold = teamTintStyle(heat({ accuracy: 0 }));
    const hot = teamTintStyle(heat({ accuracy: 1 }));
    expect(String(cold.backgroundColor)).toContain('#e31837');
    expect(String(cold.backgroundColor)).toContain('12.0%');
    expect(String(hot.backgroundColor)).toContain('42.0%');
    expect(String(hot.borderColor)).toContain('62.0%');
  });

  it('never mixes past the readability ceiling, whatever the numbers say', () => {
    const over = teamTintStyle(heat({ accuracy: 4 }));
    expect(String(over.backgroundColor)).toContain('42.0%');
  });
});

describe('teamSpineStyle', () => {
  it('scales the solid bar with the share of the roster you can name', () => {
    expect(teamSpineStyle(heat({ accuracy: 0.5 }))).toMatchObject({ height: '50.0%', backgroundColor: '#e31837' });
    expect(teamSpineStyle(heat({ accuracy: 1 })).height).toBe('100.0%');
  });

  it('hides the bar entirely on a franchise never faced', () => {
    expect(teamSpineStyle(heat({ seen: 0, correct: 0, accuracy: 0 })).opacity).toBe(0);
  });
});

describe('teamCellLabel', () => {
  it('reads as a sentence for a scouted club', () => {
    expect(teamCellLabel(heat())).toBe('Kansas City Chiefs: 6 of 8 named, 75%');
  });

  it('says so plainly when the club has never come up', () => {
    expect(teamCellLabel(heat({ seen: 0, correct: 0, accuracy: 0 }))).toBe('Kansas City Chiefs: never scouted');
  });
});

describe('groupTeamsByDivision', () => {
  const teams = scoutTeamHeatmap(emptyScoutTotals());

  it('lays all 32 franchises out as two conferences of four divisions of four', () => {
    const grouped = groupTeamsByDivision(teams);
    expect(grouped.map((c) => c.conference)).toEqual(['AFC', 'NFC']);
    for (const conf of grouped) {
      expect(conf.divisions).toHaveLength(4);
      for (const div of conf.divisions) expect(div.teams).toHaveLength(4);
    }
    expect(grouped.flatMap((c) => c.divisions.flatMap((d) => d.teams))).toHaveLength(32);
  });

  it('counts the franchises named and flags a division swept clean', () => {
    const marked = teams.map((t) =>
      t.divisionKey === 'AFC East' ? { ...t, seen: 4, correct: 2, accuracy: 0.5 } : t,
    );
    const afc = groupTeamsByDivision(marked)[0];
    const east = afc.divisions.find((d) => d.key === 'AFC East');
    expect(east?.known).toBe(4);
    expect(east?.swept).toBe(true);
    expect(afc.known).toBe(4);
    expect(afc.divisions.find((d) => d.key === 'AFC West')?.swept).toBe(false);
  });

  it('leaves a division short of a sweep unflagged', () => {
    const marked = teams.map((t, i) =>
      t.divisionKey === 'AFC East' && i % 4 !== 0 ? { ...t, seen: 2, correct: 1, accuracy: 0.5 } : t,
    );
    const east = groupTeamsByDivision(marked)[0].divisions.find((d) => d.key === 'AFC East');
    expect(east?.known).toBeLessThan(4);
    expect(east?.swept).toBe(false);
  });
});

describe('sparkGeometry', () => {
  it('draws nothing from no history', () => {
    const geo = sparkGeometry([]);
    expect(geo.line).toBe('');
    expect(geo.area).toBe('');
    expect(geo.dots).toEqual([]);
  });

  it('centres a single run', () => {
    const geo = sparkGeometry([point(0.5)], 100, 32);
    expect(geo.dots).toHaveLength(1);
    expect(geo.dots[0].x).toBe(50);
    expect(geo.line.startsWith('M50.00')).toBe(true);
  });

  it('walks left to right and puts a better run higher up', () => {
    const geo = sparkGeometry([point(0, 0), point(0.5, 1), point(1, 2)], 100, 32);
    expect(geo.dots.map((d) => d.x)).toEqual([0, 50, 100]);
    expect(geo.dots[0].y).toBeGreaterThan(geo.dots[1].y);
    expect(geo.dots[1].y).toBeGreaterThan(geo.dots[2].y);
    // padding keeps a 0% and a 100% run off the very edge
    expect(geo.dots[2].y).toBeGreaterThan(0);
    expect(geo.dots[0].y).toBeLessThan(32);
  });

  it('clamps a nonsense accuracy into the box', () => {
    const geo = sparkGeometry([point(-1, 0), point(4, 1)], 100, 32, 3);
    expect(geo.dots[0].y).toBe(29);
    expect(geo.dots[1].y).toBe(3);
  });

  it('closes the fill along the baseline and marks the halfway line', () => {
    const geo = sparkGeometry([point(0.25, 0), point(0.75, 1)], 100, 32);
    expect(geo.area.endsWith('Z')).toBe(true);
    expect(geo.area).toContain('L100.00 32');
    expect(geo.midY).toBe(16);
  });
});

describe('form averages', () => {
  it('averages accuracy, and calls an empty history zero', () => {
    expect(formAverage([])).toBe(0);
    expect(formAverage([point(0.4, 0), point(0.6, 1)])).toBeCloseTo(0.5);
  });

  it('refuses a trend until there are four runs to compare', () => {
    expect(formTrend([point(0.2, 0), point(0.9, 1), point(0.9, 2)])).toBeNull();
  });

  it('compares the newest half against the oldest half', () => {
    const up = formTrend([point(0.2, 0), point(0.2, 1), point(0.8, 2), point(0.8, 3)]);
    const down = formTrend([point(0.9, 0), point(0.9, 1), point(0.3, 2), point(0.3, 3)]);
    expect(up).toBeCloseTo(0.6);
    expect(down).toBeCloseTo(-0.6);
  });
});

describe('drillTarget', () => {
  it('sends a weak position group to that position pack', () => {
    expect(drillTarget(cut('DB', 16, 1))).toEqual({ packId: 'pos-db', label: 'Drill defensive backs' });
    expect(drillTarget(cut('QB', 16, 1))?.packId).toBe('pos-qb');
  });

  it('sends the deep cut tier to the deep cuts pack', () => {
    expect(drillTarget(cut('deepCut', 20, 2))).toEqual({ packId: 'deep-cuts', label: 'Drill deep cuts' });
  });

  it('offers nothing for a cut with no pack behind it', () => {
    expect(drillTarget(cut('star', 20, 2))).toBeNull();
    expect(drillTarget(cut('AFC West', 20, 2))).toBeNull();
    expect(drillTarget(null)).toBeNull();
  });
});

describe('rungLabel', () => {
  it('names the hardest rung as the first look', () => {
    expect(rungLabel(0)).toBe('first look');
    expect(rungLabel(1)).toBe('second look');
    expect(rungLabel(3)).toBe('rung 4');
  });
});
