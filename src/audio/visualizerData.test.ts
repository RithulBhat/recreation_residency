import { describe, expect, it } from 'vitest';
import { bandEdges, idleBars, readBars, readWave } from './visualizerData';
import { FakeAnalyserNode, FakeAudioContext } from './testUtils/fakeAudioContext';

function analyser(spectrum: number[] = [], waveform: number[] = []): { fake: FakeAnalyserNode; node: AnalyserNode } {
  const fake = new FakeAudioContext().createAnalyser();
  fake.fftSize = 256;
  fake.spectrum = spectrum;
  fake.waveform = waveform;
  return { fake, node: fake as unknown as AnalyserNode };
}

describe('bandEdges', () => {
  it('is strictly increasing from bin 1 to binCount', () => {
    const e = bandEdges(128, 32);
    expect(e.length).toBe(33);
    expect(e[0]).toBe(1);
    expect(e[32]).toBe(128);
    for (let i = 1; i < e.length; i++) expect(e[i]).toBeGreaterThan(e[i - 1]);
  });
  it('is log-spaced: the top band is far wider than the bottom one', () => {
    const e = bandEdges(128, 32);
    expect(e[32] - e[31]).toBeGreaterThan(5 * (e[1] - e[0]));
  });
  it('copes with more bars than bins', () => {
    const e = bandEdges(8, 16);
    expect(e[0]).toBe(1);
    expect(e[16]).toBe(8);
    for (let i = 1; i < e.length; i++) expect(e[i]).toBeGreaterThanOrEqual(e[i - 1]);
  });
  it('is cached', () => {
    expect(bandEdges(128, 24)).toBe(bandEdges(128, 24));
  });
});

describe('readBars', () => {
  it('returns barCount values in 0..1 (silence → all zero)', () => {
    const bars = readBars(analyser().node, 24);
    expect(bars.length).toBe(24);
    expect(Array.from(bars).every((v) => v === 0)).toBe(true);
  });
  it('a peak in bin 1 lights only the first bar', () => {
    const spectrum: number[] = [];
    spectrum[1] = 255;
    const bars = readBars(analyser(spectrum).node, 16);
    expect(bars[0]).toBe(1);
    expect(Array.from(bars.slice(1)).every((v) => v === 0)).toBe(true);
  });
  it('a peak in the top bin lights only the last bar', () => {
    const spectrum: number[] = [];
    spectrum[127] = 128;
    const bars = readBars(analyser(spectrum).node, 16);
    expect(bars[15]).toBeCloseTo(128 / 255);
    expect(Array.from(bars.slice(0, 15)).every((v) => v === 0)).toBe(true);
  });
  it('ignores the DC bin', () => {
    const spectrum: number[] = [];
    spectrum[0] = 255;
    expect(Array.from(readBars(analyser(spectrum).node, 16)).every((v) => v === 0)).toBe(true);
  });
  it('reuses the out array and applies tilt to the high end', () => {
    const out = new Float32Array(8);
    const { node } = analyser(new Array<number>(128).fill(100));
    const r = readBars(node, 8, { out, tilt: 1 });
    expect(r).toBe(out);
    expect(r[0]).toBeCloseTo(100 / 255);
    expect(r[7]).toBeCloseTo(Math.min(1, 200 / 255));
  });
  it('re-reads live data on each call', () => {
    const { fake, node } = analyser();
    expect(readBars(node, 4)[0]).toBe(0);
    fake.spectrum = [0, 255];
    expect(readBars(node, 4)[0]).toBe(1);
  });
});

describe('readWave', () => {
  it('maps silence (128) to 0 and full scale to about ±1', () => {
    expect(Array.from(readWave(analyser().node, 8)).every((v) => v === 0)).toBe(true);
    const hi = readWave(analyser([], new Array<number>(256).fill(255)).node, 8);
    expect(hi[0]).toBeCloseTo(127 / 128);
    const lo = readWave(analyser([], new Array<number>(256).fill(0)).node, 8);
    expect(lo[3]).toBe(-1);
  });
  it('samples from the first to the last frame', () => {
    const wave = new Array<number>(256).fill(128);
    wave[0] = 255;
    wave[255] = 0;
    const w = readWave(analyser([], wave).node, 5);
    expect(w.length).toBe(5);
    expect(w[0]).toBeCloseTo(127 / 128);
    expect(w[4]).toBe(-1);
    expect(w[2]).toBe(0);
  });
});

describe('idleBars', () => {
  it('is deterministic and stays inside 0..1', () => {
    const a = idleBars(1.5, 32);
    const b = idleBars(1.5, 32);
    expect(Array.from(a)).toEqual(Array.from(b));
    expect(a.length).toBe(32);
    for (const v of a) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
  it('is centre-weighted on average', () => {
    let mid = 0;
    let edge = 0;
    let samples = 0;
    for (let t = 0; t < 12; t += 0.37) {
      const bars = idleBars(t, 32);
      for (let i = 12; i < 20; i++) mid += bars[i];
      for (let i = 0; i < 4; i++) edge += bars[i] + bars[31 - i];
      samples++;
    }
    expect(mid / (8 * samples)).toBeGreaterThan(edge / (8 * samples));
  });
  it('animates over time and reuses the out array', () => {
    const out = new Float32Array(16);
    const first = Array.from(idleBars(0, 16, out));
    const second = idleBars(0.5, 16, out);
    expect(second).toBe(out);
    expect(Array.from(second)).not.toEqual(first);
  });
});
