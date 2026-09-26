/** Bolds occurrences of each query word inside `text`. */
export function HighlightMatch({ text, query, className }: { text: string; query: string; className?: string }) {
  const words = query
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 0);
  if (words.length === 0) return <span className={className}>{text}</span>;
  const re = new RegExp(`(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'ig');
  const parts = text.split(re);
  return (
    <span className={className}>
      {parts.map((p, i) =>
        p && words.includes(p.toLowerCase()) ? (
          <mark key={i} className="rounded-sm bg-transparent text-accent">
            {p}
          </mark>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </span>
  );
}
