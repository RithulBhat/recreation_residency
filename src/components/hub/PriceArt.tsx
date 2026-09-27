/**
 * Price Guess's card art: a till receipt with the total still hidden.
 *
 * Pure inline SVG with `currentColor`, so it inherits the card's tone and works in all four
 * themes without a second asset.
 */
export function PriceArt() {
  return (
    <svg viewBox="0 0 120 120" className="size-full" role="img" aria-label="A receipt with the total hidden">
      <defs>
        <linearGradient id="price-art-fade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.35" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0.05" />
        </linearGradient>
      </defs>
      <path
        d="M30 14h60v84l-7.5-6-7.5 6-7.5-6-7.5 6-7.5-6-7.5 6-7.5-6-7.5 6z"
        fill="url(#price-art-fade)"
        stroke="currentColor"
        strokeOpacity="0.5"
        strokeWidth="2"
      />
      {[30, 42, 54, 66].map((y) => (
        <g key={y}>
          <rect x="40" y={y} width="26" height="4" rx="2" fill="currentColor" opacity="0.35" />
          <rect x="72" y={y} width="12" height="4" rx="2" fill="currentColor" opacity="0.2" />
        </g>
      ))}
      <rect x="40" y="80" width="20" height="5" rx="2.5" fill="currentColor" opacity="0.5" />
      <text
        x="78"
        y="86"
        textAnchor="middle"
        fontSize="16"
        fontWeight="700"
        fill="currentColor"
        opacity="0.9"
      >
        ?
      </text>
    </svg>
  );
}
