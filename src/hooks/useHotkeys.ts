import { useEffect, useRef } from 'react';

export type HotkeyHandler = (e: KeyboardEvent) => void;

/**
 * Keys are matched against `e.key` (case-insensitive) or `e.code`.
 * Combos: 'mod+k' (mod = ⌘ on mac / ctrl elsewhere), 'shift+/', 'ctrl+enter'.
 * Special names: 'space', 'enter', 'escape', 'esc', 'up', 'down', 'left', 'right', 'tab', 'backspace'.
 */
export type HotkeyMap = Record<string, HotkeyHandler | undefined>;

export interface HotkeyOptions {
  /** Fire even when focus is inside an input/textarea/select/contenteditable. Default false. */
  allowInInputs?: boolean;
  /** Only listen while true. Default true. */
  enabled?: boolean;
  /** Call preventDefault() on match. Default true. */
  preventDefault?: boolean;
  /** Attach to a specific element instead of window. */
  target?: EventTarget | null;
}

const ALIASES: Record<string, string> = {
  esc: 'escape',
  space: ' ',
  up: 'arrowup',
  down: 'arrowdown',
  left: 'arrowleft',
  right: 'arrowright',
  return: 'enter',
  del: 'delete',
};

function isMac(): boolean {
  return typeof navigator !== 'undefined' && /mac|iphone|ipad|ipod/i.test(navigator.platform || navigator.userAgent);
}

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return target.isContentEditable;
}

interface ParsedKey {
  key: string;
  ctrl: boolean;
  meta: boolean;
  alt: boolean;
  shift: boolean;
  mod: boolean;
}

function parse(combo: string): ParsedKey {
  const parts = combo.toLowerCase().split('+').map((p) => p.trim());
  const key = parts.pop() ?? '';
  const p: ParsedKey = { key: ALIASES[key] ?? key, ctrl: false, meta: false, alt: false, shift: false, mod: false };
  for (const m of parts) {
    if (m === 'ctrl' || m === 'control') p.ctrl = true;
    else if (m === 'meta' || m === 'cmd' || m === 'command') p.meta = true;
    else if (m === 'alt' || m === 'option') p.alt = true;
    else if (m === 'shift') p.shift = true;
    else if (m === 'mod') p.mod = true;
  }
  return p;
}

function matches(p: ParsedKey, e: KeyboardEvent): boolean {
  const key = e.key.toLowerCase();
  const code = e.code.toLowerCase();
  const keyOk = key === p.key || code === p.key || (p.key.length === 1 && code === `key${p.key}`) || (p.key.length === 1 && /^\d$/.test(p.key) && code === `digit${p.key}`);
  if (!keyOk) return false;
  const mac = isMac();
  const wantCtrl = p.ctrl || (p.mod && !mac);
  const wantMeta = p.meta || (p.mod && mac);
  if (e.ctrlKey !== wantCtrl) return false;
  if (e.metaKey !== wantMeta) return false;
  if (e.altKey !== p.alt) return false;
  // Allow shift to be implicit for punctuation like '?' (which needs shift).
  if (p.shift && !e.shiftKey) return false;
  if (!p.shift && e.shiftKey && p.key.length !== 1) return false;
  return true;
}

/**
 * useHotkeys({ ' ': play, 'enter': submit, 'mod+k': openSearch, '?': showHelp })
 * Ignores keystrokes while typing in inputs unless `allowInInputs` is set.
 */
export function useHotkeys(map: HotkeyMap, options: HotkeyOptions = {}): void {
  const { allowInInputs = false, enabled = true, preventDefault = true, target } = options;
  const mapRef = useRef(map);
  mapRef.current = map;

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;
    const el: EventTarget = target ?? window;
    const parsed = Object.keys(mapRef.current).map((k) => [k, parse(k)] as const);
    const onKey = (ev: Event) => {
      const e = ev as KeyboardEvent;
      if (e.defaultPrevented) return;
      if (!allowInInputs && isTypingTarget(e.target)) return;
      for (const [name, p] of parsed) {
        const handler = mapRef.current[name];
        if (!handler) continue;
        if (matches(p, e)) {
          if (preventDefault) e.preventDefault();
          handler(e);
          return;
        }
      }
    };
    el.addEventListener('keydown', onKey);
    return () => el.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, allowInInputs, preventDefault, target, Object.keys(map).join('|')]);
}
