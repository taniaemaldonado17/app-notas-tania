/**
 * JSON with object keys sorted, so two values compare equal no matter the
 * key order (Postgres jsonb does not keep the order keys were written in).
 */
export function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_k, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, (v as Record<string, unknown>)[k]]))
      : v
  )
}

export const sameJson = (a: unknown, b: unknown) => stableStringify(a) === stableStringify(b)
