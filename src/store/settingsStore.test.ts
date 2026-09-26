import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '@/game/presets';
import { DEFAULT_PREFS, MAX_RECENT_PACKS, MAX_RECENT_TRACKS, SETTINGS_STORAGE_KEY, sanitizePersisted, useSettingsStore } from './settingsStore';

describe('settingsStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useSettingsStore.setState({ ...DEFAULT_PREFS, settings: { ...DEFAULT_SETTINGS } });
  });

  it('has sane defaults', () => {
    const s = useSettingsStore.getState();
    expect(s.settings).toEqual(DEFAULT_SETTINGS);
    expect(s.theme).toBe('midnight');
    expect(s.volume).toBe(0.8);
    expect(s.sfxEnabled).toBe(true);
    expect(s.recentPackIds).toEqual([]);
  });

  it('update normalizes the draft and persists it', () => {
    useSettingsStore.getState().update({ mode: 'fixed', clipLength: 99, tries: 50 });
    const s = useSettingsStore.getState().settings;
    expect(s).toMatchObject({ mode: 'fixed', clipMode: 'fixed', clipLength: 10, tries: 6 });
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!) as { state: { settings: { clipLength: number } }; version: number };
    expect(parsed.state.settings.clipLength).toBe(10);
    expect(parsed.version).toBe(1);
  });

  it('applyPreset keeps packs and resets the rest; unknown ids ignored', () => {
    useSettingsStore.getState().update({ packIds: ['rock'], roundTimer: 30 });
    useSettingsStore.getState().applyPreset('sniper');
    const s = useSettingsStore.getState().settings;
    expect(s.packIds).toEqual(['rock']);
    expect(s.clipLength).toBe(0.3);
    expect(s.tries).toBe(1);
    expect(s.roundTimer).toBe(0);
    const before = useSettingsStore.getState().settings;
    useSettingsStore.getState().applyPreset('does-not-exist');
    expect(useSettingsStore.getState().settings).toBe(before);
    useSettingsStore.getState().reset();
    expect(useSettingsStore.getState().settings).toEqual(DEFAULT_SETTINGS);
  });

  it('pref setters clamp and validate', () => {
    const st = useSettingsStore.getState();
    st.setVolume(5);
    expect(useSettingsStore.getState().volume).toBe(1);
    st.setVolume(-1);
    expect(useSettingsStore.getState().volume).toBe(0);
    st.setTheme('y2k');
    expect(useSettingsStore.getState().theme).toBe('y2k');
    st.setSfxEnabled(false);
    st.setHostPersonality('savage');
    st.setHostVoiceURI('');
    st.setReducedMotion('on');
    st.setPlayerName('  Rithul  ');
    const s = useSettingsStore.getState();
    expect(s.sfxEnabled).toBe(false);
    expect(s.hostPersonality).toBe('savage');
    expect(s.hostVoiceURI).toBeNull();
    expect(s.reducedMotion).toBe('on');
    expect(s.playerName).toBe('Rithul');
  });

  it('recent packs / tracks are most-recent-first, unique and capped', () => {
    const st = useSettingsStore.getState();
    for (let i = 0; i < 12; i++) st.pushRecentPack(`p${i}`);
    st.pushRecentPack('p5');
    const packs = useSettingsStore.getState().recentPackIds;
    expect(packs).toHaveLength(MAX_RECENT_PACKS);
    expect(packs[0]).toBe('p5');
    expect(new Set(packs).size).toBe(packs.length);

    st.pushRecentTracks(Array.from({ length: 250 }, (_, i) => i));
    st.pushRecentTracks(Array.from({ length: 100 }, (_, i) => 1000 + i));
    const tracks = useSettingsStore.getState().recentTrackIds;
    expect(tracks).toHaveLength(MAX_RECENT_TRACKS);
    expect(tracks[0]).toBe(1000);
    expect(tracks).not.toContain(249);
    st.pushRecentTracks([1000]);
    expect(useSettingsStore.getState().recentTrackIds.filter((x) => x === 1000)).toHaveLength(1);
    st.clearRecentTracks();
    expect(useSettingsStore.getState().recentTrackIds).toEqual([]);
  });

  it('sanitizePersisted repairs corrupted storage and normalizes settings', () => {
    const s = sanitizePersisted({
      settings: { mode: 'fixed', clipLength: 'bad', stages: [3, 1] },
      theme: 'neon',
      volume: 7,
      recentPackIds: ['a', 1, 'a'],
      recentTrackIds: ['x', 2, 2],
      playerName: 42,
    });
    expect(s.settings.mode).toBe('fixed');
    expect(s.settings.clipLength).toBe(1);
    expect(s.theme).toBe('midnight');
    expect(s.volume).toBe(1);
    expect(s.recentPackIds).toEqual(['a']);
    expect(s.recentTrackIds).toEqual([2]);
    expect(s.playerName).toBe('');
    expect(sanitizePersisted(null).settings).toEqual(DEFAULT_SETTINGS);
  });

  it('rehydrates persisted state through normalizeSettings', async () => {
    localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({ state: { settings: { mode: 'classic', stages: [2, 0.5, 2] }, theme: 'vinyl', volume: 0.3 }, version: 1 }),
    );
    await useSettingsStore.persist.rehydrate();
    const s = useSettingsStore.getState();
    expect(s.settings.stages).toEqual([0.5, 2]);
    expect(s.settings.tries).toBe(2);
    expect(s.theme).toBe('vinyl');
    expect(s.volume).toBe(0.3);
  });
});
