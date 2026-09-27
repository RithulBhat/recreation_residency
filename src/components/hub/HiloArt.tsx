/**
 * Higher or Lower's card art: two columns, one known and one still hidden, with the arrows you
 * press between them. Inline SVG on `currentColor` so it themes itself.
 */
export function HiloArt() {
  return (
    <svg viewBox="0 0 120 120" className="size-full" role="img" aria-label="Two bars, one hidden, with up and down arrows">
      <rect x="18" y="46" width="28" height="56" rx="6" fill="currentColor" opacity="0.32" />
      <rect x="74" y="24" width="28" height="78" rx="6" fill="currentColor" opacity="0.12" />
      <rect
        x="74"
        y="24"
        width="28"
        height="78"
        rx="6"
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.4"
        strokeWidth="2"
        strokeDasharray="5 4"
      />
      <text x="32" y="38" textAnchor="middle" fontSize="13" fontWeight="700" fill="currentColor" opacity="0.75">
        101M
      </text>
      <text x="88" y="16" textAnchor="middle" fontSize="15" fontWeight="700" fill="currentColor" opacity="0.85">
        ?
      </text>
      <g stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity="0.7">
        <path d="M60 58l0-14M54 50l6-6 6 6" />
        <path d="M60 76l0 14M54 84l6 6 6-6" />
      </g>
    </svg>
  );
}
