/**
 * Custom packs — packs the player builds at runtime (any artist, a pasted Deezer playlist/album
 * URL, or a free-text search). They are registered into the same lookup map the catalog uses so
 * `buildPool` / `getPack` find them, and persisted so they survive reloads.
 */
import { PACKS_BY_ID } from '@/data/packs';
import type { Pack } from '@/types';

const STORAGE_KEY = 'sg:custom-packs';
const MAX_CUSTOM = 40;
const registry = PACKS_BY_ID as Map<string, Pack>;
let loaded = false;
let custom: Pack[] = [];

function persist(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(custom));
  } catch {
    /* quota / private mode — ignore */
  }
}

function isPack(v: unknown): v is Pack {
  if (!v || typeof v !== 'object') return false;
  const p = v as Record<string, unknown>;
  return typeof p.id === 'string' && typeof p.name === 'string' && Array.isArray(p.sources);
}

/** Load persisted custom packs into the registry. Idempotent; called lazily by the helpers below. */
export function loadCustomPacks(): Pack[] {
  if (loaded) return custom;
  loaded = true;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    custom = Array.isArray(parsed) ? parsed.filter(isPack) : [];
  } catch {
    custom = [];
  }
  for (const p of custom) registry.set(p.id, p);
  return custom;
}

/** Register (or replace) a custom pack so the catalog can resolve it. Returns the pack. */
export function registerCustomPack(pack: Pack): Pack {
  loadCustomPacks();
  const p: Pack = { ...pack, category: 'custom' };
  registry.set(p.id, p);
  custom = [p, ...custom.filter((c) => c.id !== p.id)].slice(0, MAX_CUSTOM);
  persist();
  return p;
}

export function removeCustomPack(id: string): void {
  loadCustomPacks();
  custom = custom.filter((c) => c.id !== id);
  registry.delete(id);
  persist();
}

/** All custom packs, newest first. */
export function customPacks(): Pack[] {
  return loadCustomPacks().slice();
}
