import { Vinyl } from '@/components/Vinyl';
import { Visualizer } from '@/components/Visualizer';

/**
 * Songooner's world, as living art: the record from the game's own hero, still spinning, over the
 * violet → cyan → pink light spill, with the real idle waveform underneath.
 *
 * Both pieces are the shipped components, so the card cannot drift from the game. They are inert
 * here — the `Vinyl` is `disabled` (its button is therefore unfocusable) and the whole block is
 * `aria-hidden` and `pointer-events-none`, so the card's own link owns every click and the screen
 * reader hears the card once.
 *
 * Motion: `.vinyl-spin` and the `Visualizer`'s rAF loop both stop under `prefers-reduced-motion`.
 */
export function SongoonerArt() {
  return (
    <div className="hub-stage-song pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <div className="hub-grooves absolute inset-0 opacity-70" />

      {/* The record: 52 % of the art's width, so it scales with the card rather than the viewport. */}
      <div className="absolute inset-0 flex items-center justify-center pb-[12%]">
        <div className="aspect-square w-[46%] max-w-[190px]">
          <Vinyl state="playing" progress={0.34} size="100%" disabled hideIcon aria-label="Songooner" />
        </div>
      </div>

      {/* Settle the light spill towards the card body, then draw the waveform on top of it. */}
      <div className="absolute inset-0 bg-gradient-to-t from-bg-elevated/85 via-transparent to-transparent" />

      {/* Waveform along the bottom edge — the game's second signature. */}
      <div className="absolute inset-x-0 bottom-0 h-[26%]">
        <Visualizer analyser={null} active={false} variant="bars" bars={28} idleAmplitude={0.9} mirror={false} />
      </div>
    </div>
  );
}
