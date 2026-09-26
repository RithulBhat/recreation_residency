import { useEffect, useState } from 'react';
import { Plus, X } from 'lucide-react';
import type { PlayerConfig } from '@/types';
import { LIMITS } from '@/game/presets';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { Input } from '@/components/ui/Input';
import { Popover } from '@/components/ui/Popover';
import { cn } from '@/components/ui/cn';
import { PLAYER_COLORS, PLAYER_EMOJI, nextDefaultPlayer } from './players';

export interface PlayersEditorProps {
  players: readonly PlayerConfig[];
  onChange: (players: PlayerConfig[]) => void;
  min: number;
  max: number;
}

interface RowProps {
  player: PlayerConfig;
  index: number;
  removable: boolean;
  onChange: (next: PlayerConfig) => void;
  onRemove: () => void;
}

function PlayerRow({ player, index, removable, onChange, onRemove }: RowProps) {
  // Local draft so clearing the field doesn't snap back to the default name mid-edit.
  const [name, setName] = useState(player.name);
  useEffect(() => setName(player.name), [player.name]);

  const commit = (value: string) => {
    const trimmed = value.trim().slice(0, 24);
    if (trimmed && trimmed !== player.name) onChange({ ...player, name: trimmed });
  };

  return (
    <li className="flex items-center gap-2.5">
      <Popover
        align="start"
        width={296}
        aria-label={`Look for ${player.name}`}
        trigger={
          <button
            type="button"
            aria-label={`Change emoji and colour for ${player.name}`}
            className="rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-2"
          >
            <Avatar emoji={player.emoji} color={player.color} size="md" name={undefined} aria-hidden />
          </button>
        }
      >
        <div className="p-1">
          <div className="grid grid-cols-8 gap-1" role="group" aria-label="Emoji">
            {PLAYER_EMOJI.map((e) => (
              <button
                key={e}
                type="button"
                aria-label={`Emoji ${e}`}
                aria-pressed={player.emoji === e}
                onClick={() => onChange({ ...player, emoji: e })}
                className={cn('grid size-8 place-items-center rounded-lg text-lg leading-none transition-colors hover:bg-surface-strong', player.emoji === e && 'bg-accent/20 ring-1 ring-accent')}
              >
                {e}
              </button>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5 border-t border-border pt-2" role="group" aria-label="Colour">
            {PLAYER_COLORS.map((c) => (
              <button
                key={c.hex}
                type="button"
                aria-label={c.name}
                aria-pressed={player.color === c.hex}
                onClick={() => onChange({ ...player, color: c.hex })}
                className={cn('size-7 rounded-full border-2 transition-transform hover:scale-110', player.color === c.hex ? 'border-fg' : 'border-transparent')}
                style={{ background: c.hex }}
              />
            ))}
          </div>
        </div>
      </Popover>

      <Input
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          commit(e.target.value);
        }}
        onBlur={() => {
          if (!name.trim()) setName(player.name);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
        }}
        maxLength={24}
        aria-label={`Player ${index + 1} name`}
        placeholder={`Player ${index + 1}`}
        containerClassName="min-w-0 flex-1"
      />

      {removable && <IconButton aria-label={`Remove ${player.name}`} icon={<X />} size="sm" onClick={onRemove} />}
    </li>
  );
}

/** Name / emoji / colour rows. Duel is fixed at 2, party grows to 8. */
export function PlayersEditor({ players, onChange, min, max }: PlayersEditorProps) {
  const canAdd = players.length < Math.min(max, LIMITS.players.max);
  const canRemove = players.length > min;

  const replace = (i: number, next: PlayerConfig) => onChange(players.map((p, j) => (j === i ? next : p)));

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2.5" aria-label="Players">
        {players.map((p, i) => (
          <PlayerRow
            key={p.id}
            player={p}
            index={i}
            removable={canRemove}
            onChange={(next) => replace(i, next)}
            onRemove={() => onChange(players.filter((_, j) => j !== i))}
          />
        ))}
      </ul>
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-[11px] tabular text-muted">
          {players.length} of {max} players
        </span>
        {max > min && (
          <Button size="sm" variant="secondary" leadingIcon={<Plus />} disabled={!canAdd} onClick={() => onChange([...players, nextDefaultPlayer(players)])}>
            Add player
          </Button>
        )}
      </div>
    </div>
  );
}
