import { DUEL_BUZZ_KEYS, SCOUT_FORMAT_LIMITS, isScoutBuzzerDuel, isScoutMultiplayer, scoutFormat } from '@/scout/formats';
import { useScoutSettingsStore } from '@/store/scoutStore';
import { Kbd } from '@/components/ui/Kbd';
import { PlayersEditor } from '@/components/setup/PlayersEditor';
import { seatsLabel } from './summary';

/**
 * Who is playing — duel (exactly two) and party (two to eight). Renders nothing in the solo formats,
 * which keep an empty roster, so the lobby never shows a table nobody sits at.
 *
 * The roster itself is Songooner's `PlayersEditor` (name, emoji, colour), because `PlayerConfig` is
 * shared between the two games; the Scout-specific part is the buzz-key legend, which reads the real
 * `DUEL_BUZZ_KEYS` the engine listens for rather than retyping A and L.
 */
export function ScoutSeats() {
  const settings = useScoutSettingsStore((s) => s.settings);
  const update = useScoutSettingsStore((s) => s.update);
  const format = scoutFormat(settings);
  if (!isScoutMultiplayer(settings)) return null;

  const players = settings.players ?? [];
  const duel = format === 'duel';
  const buzzer = isScoutBuzzerDuel(settings);

  return (
    <div className="flex flex-col gap-3" data-setting="players">
      <PlayersEditor
        players={players}
        onChange={(next) => update({ players: next })}
        min={duel ? 2 : SCOUT_FORMAT_LIMITS.players.min}
        max={duel ? 2 : SCOUT_FORMAT_LIMITS.players.max}
      />

      {buzzer ? (
        <ul className="flex flex-col gap-1.5 rounded-2xl bg-surface px-3.5 py-3" data-testid="scout-buzz-keys">
          {players.map((p, i) => (
            <li key={p.id} className="flex items-center gap-2 text-xs text-muted">
              <span className="size-2 shrink-0 rounded-full" style={{ background: p.color }} aria-hidden />
              <span className="min-w-0 truncate font-semibold text-fg">{p.name}</span>
              <span>buzzes with</span>
              <Kbd size="sm">{(DUEL_BUZZ_KEYS[i] ?? '').toUpperCase()}</Kbd>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-2xl bg-surface px-3.5 py-3 text-xs text-muted" data-testid="scout-turn-order">
          <span className="font-semibold text-fg">Turn order</span> — {players.map((p) => `${p.emoji} ${p.name}`).join(' → ')}
          {duel ? '. One subject each, round by round.' : `. ${seatsLabel(players.length)}, then back to the top.`}
        </p>
      )}
    </div>
  );
}
