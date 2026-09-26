export type ClassValue = string | number | null | undefined | false | ClassValue[] | Record<string, boolean | null | undefined>;

/** Tiny className joiner (no dependency). Supports strings, arrays and { class: bool } maps. */
export function cn(...inputs: ClassValue[]): string {
  const out: string[] = [];
  const push = (v: ClassValue) => {
    if (!v) return;
    if (typeof v === 'string' || typeof v === 'number') out.push(String(v));
    else if (Array.isArray(v)) v.forEach(push);
    else for (const k in v) if (v[k]) out.push(k);
  };
  inputs.forEach(push);
  return out.join(' ');
}
