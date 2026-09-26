/**
 * Highlight Scout challenge links and daily runs.
 *
 * `encodeScoutChallenge` → compact-key JSON → base64url (same shape and size class as Songooner's
 * codes); `decodeScoutChallenge` validates every field before handing it back, so a tampered code
 * degrades to defaults instead of producing a broken run.
 *
 * The daily is fully derived from the date: `scoutDailyMode` rotates the mode deterministically and
 * `dailyScoutSeed` seeds the queue, so every device plays the same subjects in the same order.
 */

import { hashToUnit } from '@/game/rng';
import { todayISO } from '@/game/challenge';
import { R } from '@/routes';
import { DEFAULT_SCOUT_PACK_ID } from './packs';
import { DEFAULT_SCOUT_SETTINGS, DEFAULT_TEAM_PACK_ID, SCOUT_MODE_IDS, normalizeScoutSettings } from './presets';
import { subjectKindForMode } from './subjects';
import type { ScoutMode, ScoutSettings } from './types';

export { todayISO };

export interface ScoutChallengePayload {
  v: 1;
  seed: string;
  settings: Partial<ScoutSettings>;
  /** Who sent it (≤ 24 chars). */
  by?: string;
  /** The sender's score, for the "beat this" banner. */
  score?: number;
  /** Subject keys ('player:3139477'), so both sides can play the same list. */
  subjects?: string[];
}

const KEYS = {
  mode: 'm',
  packIds: 'p',
  difficulty: 'd',
  tries: 't',
  rounds: 'r',
  roundTimer: 'k',
  hintsEnabled: 'h',
  mixModes: 'x',
  daily: 'q',
} as const;

type EncodableKey = keyof typeof KEYS;
const ENCODABLE_KEYS = Object.keys(KEYS) as EncodableKey[];
const MAX_SUBJECT_KEYS = 60;

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

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function encodeScoutChallenge(p: ScoutChallengePayload): string {
  const g: Record<string, unknown> = {};
  const settings = p.settings;
  for (const key of ENCODABLE_KEYS) {
    const value = settings[key];
    if (value === undefined) continue;
    // mode + packs always travel; anything equal to the default is dropped to keep codes short
    if (key !== 'mode' && key !== 'packIds' && sameValue(value, DEFAULT_SCOUT_SETTINGS[key])) continue;
    g[KEYS[key]] = value;
  }
  const compact: Record<string, unknown> = { v: 1, s: p.seed, g };
  if (p.by) compact.b = p.by.slice(0, 24);
  if (typeof p.score === 'number' && Number.isFinite(p.score)) compact.c = Math.round(p.score);
  if (Array.isArray(p.subjects) && p.subjects.length > 0) {
    compact.i = p.subjects.filter((x) => typeof x === 'string' && x !== '').slice(0, MAX_SUBJECT_KEYS);
  }
  return toBase64Url(JSON.stringify(compact));
}

export function decodeScoutChallenge(code: string): ScoutChallengePayload | null {
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
  if (typeof mode !== 'string' || !(SCOUT_MODE_IDS as readonly string[]).includes(mode)) return null;
  if (!Array.isArray(packIds) || packIds.length === 0 || !packIds.every((x) => typeof x === 'string')) return null;

  const settings: Partial<ScoutSettings> = { mode: mode as ScoutMode, packIds: packIds as string[] };
  const out = settings as Record<string, unknown>;
  for (const key of ENCODABLE_KEYS) {
    if (key === 'mode' || key === 'packIds') continue;
    const value = g[KEYS[key]];
    if (value === undefined) continue;
    const expected = DEFAULT_SCOUT_SETTINGS[key];
    if (Array.isArray(expected) ? Array.isArray(value) : typeof value === typeof expected || expected === undefined) {
      out[key] = value;
    }
  }

  const payload: ScoutChallengePayload = { v: 1, seed: raw.s.trim(), settings };
  if (typeof raw.b === 'string' && raw.b.trim() !== '') payload.by = raw.b.trim().slice(0, 24);
  if (typeof raw.c === 'number' && Number.isFinite(raw.c)) payload.score = raw.c;
  if (Array.isArray(raw.i)) {
    const ids = raw.i.filter((x): x is string => typeof x === 'string' && x !== '');
    if (ids.length > 0) payload.subjects = ids.slice(0, MAX_SUBJECT_KEYS);
  }
  return payload;
}

/** Full, normalized settings for playing a challenge (its seed applied). */
export function scoutChallengeSettings(p: ScoutChallengePayload): ScoutSettings {
  return normalizeScoutSettings({ ...p.settings, seed: p.seed });
}

/** `/scout/c/<code>` — Highlight Scout's challenge route. */
export function scoutChallengePath(code: string): string {
  return `${R.scout.home}/c/${code}`;
}

export function buildScoutChallengeUrl(p: ScoutChallengePayload): string {
  const code = encodeScoutChallenge(p);
  const loc = typeof location !== 'undefined' ? location : undefined;
  const base = loc ? `${loc.origin}${loc.pathname}` : '';
  return `${base}#${scoutChallengePath(code)}`;
}

/** Extract the code from a full URL, a hash, or a bare code. */
export function parseScoutChallengeCode(input: string): string | null {
  const m = input.match(/\/c\/([A-Za-z0-9_-]+)/);
  if (m) return m[1];
  return /^[A-Za-z0-9_-]+$/.test(input.trim()) ? input.trim() : null;
}

export function dailyScoutSeed(dateISO: string): string {
  return `scout-daily-${dateISO}`;
}

/** The mode of the day — deterministic, and it visits every mode over time. */
export function scoutDailyMode(dateISO: string): ScoutMode {
  const u = hashToUnit(`scout-mode|${dateISO}`);
  const i = Math.min(SCOUT_MODE_IDS.length - 1, Math.floor(u * SCOUT_MODE_IDS.length));
  return SCOUT_MODE_IDS[i];
}

/** Eight rounds, five tries, mode of the day, seeded from the date. */
export function scoutDailySettings(dateISO: string): ScoutSettings {
  const mode = scoutDailyMode(dateISO);
  const packId = subjectKindForMode(mode) === 'team' ? DEFAULT_TEAM_PACK_ID : DEFAULT_SCOUT_PACK_ID;
  return normalizeScoutSettings({
    mode,
    packIds: [packId],
    difficulty: 'any',
    tries: 5,
    rounds: 8,
    roundTimer: 0,
    hintsEnabled: true,
    mixModes: false,
    seed: dailyScoutSeed(dateISO),
    daily: dateISO,
  });
}
