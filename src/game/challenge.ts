/**
 * Challenge links + daily seeds.
 * `encodeChallenge` → compact-key JSON → base64url; `decodeChallenge` validates and expands.
 */

import type { ChallengePayload, GameMode, GameSettings, Modifiers } from '@/types';
import { DEFAULT_SETTINGS, normalizeSettings } from './presets';

const MODES: readonly GameMode[] = ['classic', 'fixed', 'blitz', 'survival', 'duel', 'party'];

/** Compact key map for settings fields (players/voiceHost/seed are never encoded). */
const KEYS = {
  mode: 'm',
  packIds: 'p',
  difficulty: 'd',
  clipMode: 'c',
  clipLength: 'l',
  stages: 's',
  tries: 't',
  rounds: 'r',
  startPosition: 'o',
  sameStartEachTry: 'e',
  guessTarget: 'g',
  hintsEnabled: 'h',
  roundTimer: 'k',
  modifiers: 'x',
  allowSkip: 'a',
  explicitFilter: 'f',
  blitzDuration: 'b',
  lives: 'v',
  duelStyle: 'u',
  daily: 'q',
} as const;

type EncodableKey = keyof typeof KEYS;
const ENCODABLE_KEYS = Object.keys(KEYS) as EncodableKey[];

type CompactSettings = Record<string, unknown>;

interface CompactPayload {
  v: 1;
  s: string;
  g: CompactSettings;
  b?: string;
  c?: number;
  /** track ids */
  i?: number[];
}

function encodeModifiers(m: Modifiers): unknown[] {
  return [m.speed, m.reverse ? 1 : 0, m.lofi ? 1 : 0, m.bitcrush ? 1 : 0, m.pitch];
}

function decodeModifiers(raw: unknown): Modifiers | undefined {
  if (!Array.isArray(raw) || raw.length < 5) return undefined;
  const [speed, reverse, lofi, bitcrush, pitch] = raw as unknown[];
  if (typeof speed !== 'number' || typeof pitch !== 'number') return undefined;
  return {
    speed: speed as Modifiers['speed'],
    reverse: reverse === 1 || reverse === true,
    lofi: lofi === 1 || lofi === true,
    bitcrush: bitcrush === 1 || bitcrush === true,
    pitch,
  };
}

function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function toBase64Url(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(code: string): string | null {
  try {
    const b64 = code.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (code.length % 4)) % 4);
    const bin = atob(b64);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

export function encodeChallenge(p: ChallengePayload): string {
  const g: CompactSettings = {};
  const settings = p.settings as Partial<GameSettings>;
  for (const key of ENCODABLE_KEYS) {
    const value = settings[key];
    if (value === undefined) continue;
    // always keep mode + packs; drop everything equal to the defaults to keep codes short
    if (key !== 'mode' && key !== 'packIds' && sameValue(value, DEFAULT_SETTINGS[key])) continue;
    g[KEYS[key]] = key === 'modifiers' ? encodeModifiers(value as Modifiers) : value;
  }
  const compact: CompactPayload = { v: 1, s: p.seed, g };
  if (p.by) compact.b = p.by.slice(0, 24);
  if (typeof p.score === 'number' && Number.isFinite(p.score)) compact.c = Math.round(p.score);
  if (Array.isArray(p.trackIds) && p.trackIds.length > 0) {
    compact.i = p.trackIds.filter((n) => Number.isInteger(n) && n > 0).slice(0, 60);
  }
  return toBase64Url(JSON.stringify(compact));
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function decodeChallenge(code: string): ChallengePayload | null {
  if (typeof code !== 'string' || code.trim() === '') return null;
  const json = fromBase64Url(code.trim());
  if (json === null) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return null;
  }
  if (!isRecord(raw) || raw.v !== 1) return null;
  if (typeof raw.s !== 'string' || raw.s.trim() === '') return null;
  const g = raw.g;
  if (!isRecord(g)) return null;
  const mode = g[KEYS.mode];
  const packIds = g[KEYS.packIds];
  if (typeof mode !== 'string' || !(MODES as readonly string[]).includes(mode)) return null;
  if (!Array.isArray(packIds) || packIds.length === 0 || !packIds.every((x) => typeof x === 'string')) return null;

  const settings: Partial<GameSettings> & Pick<GameSettings, 'packIds' | 'mode'> = {
    mode: mode as GameMode,
    packIds: packIds as string[],
  };
  const out = settings as Record<string, unknown>;
  for (const key of ENCODABLE_KEYS) {
    if (key === 'mode' || key === 'packIds') continue;
    const value = g[KEYS[key]];
    if (value === undefined) continue;
    if (key === 'modifiers') {
      const m = decodeModifiers(value);
      if (m) out.modifiers = m;
      continue;
    }
    const expected = DEFAULT_SETTINGS[key];
    // type-guard against tampered codes: arrays stay arrays, primitives keep their type
    if (Array.isArray(expected) ? Array.isArray(value) : typeof value === typeof expected || expected === undefined) {
      out[key] = value;
    }
  }

  const payload: ChallengePayload = { v: 1, seed: raw.s.trim(), settings };
  if (typeof raw.b === 'string' && raw.b.trim()) payload.by = raw.b.trim().slice(0, 24);
  if (typeof raw.c === 'number' && Number.isFinite(raw.c)) payload.score = raw.c;
  if (Array.isArray(raw.i)) {
    const ids = raw.i.filter((n): n is number => typeof n === 'number' && Number.isInteger(n) && n > 0);
    if (ids.length > 0) payload.trackIds = ids.slice(0, 60);
  }
  return payload;
}

/** Full, normalized settings for playing a challenge (seed applied). */
export function challengeSettings(p: ChallengePayload): GameSettings {
  return normalizeSettings({ ...p.settings, seed: p.seed, players: [] });
}

export function buildChallengeUrl(p: ChallengePayload): string {
  const code = encodeChallenge(p);
  const loc = typeof location !== 'undefined' ? location : undefined;
  const base = loc ? `${loc.origin}${loc.pathname}` : '';
  return `${base}#/c/${code}`;
}

/** Extract the code from a full challenge URL, a hash, or a bare code. */
export function parseChallengeCode(input: string): string | null {
  const m = input.match(/#?\/?c\/([A-Za-z0-9_-]+)/);
  if (m) return m[1];
  return /^[A-Za-z0-9_-]+$/.test(input.trim()) ? input.trim() : null;
}

export function dailySeed(dateISO: string): string {
  return `daily-${dateISO}`;
}

/** Local calendar date as YYYY-MM-DD. */
export function todayISO(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Classic, 10 rounds, seeded from the date, flagged as the daily. */
export function dailySettings(dateISO: string, packId: string): GameSettings {
  return normalizeSettings({
    ...DEFAULT_SETTINGS,
    mode: 'classic',
    clipMode: 'escalating',
    stages: [...DEFAULT_SETTINGS.stages],
    rounds: 10,
    packIds: [packId],
    seed: dailySeed(dateISO),
    daily: dateISO,
    players: [],
  });
}
