// PRNG — seedable mulberry32 + hash helpers. Replaces direct Math.random in game-logic.
//
// Why: replay determinism (save → reload → same RNG sequence). Each Math.random in
// game/ code now gets a seed derived from local deterministic inputs, so the same
// inputs always produce the same roll. loadFromSlot in state.ts doesn't need to
// persist RNG state — the seed is recomputed from existing save fields.
//
// ponytail: per-call mulberry32(seed)() is tier 6 (one-liner per callsite). We
// don't use a global single-context RNG — that would require schema migration to
// snapshot the seed, which is out of scope. Upgrade path: `no-restricted-properties`
// rule in `.oxlintrc.json` bans `Math.random` project-wide — cosmetic IDs use
// `crypto.randomUUID()` (native), animation uses seeded `mulberry32` for
// deterministic replay. Commit-time guardrail, not runtime enforcement.

// ponytail: mulberry32 — simple, fast, seedable. 2^32 period. Adequate for game-logic.
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ponytail: 32-bit xorshift hash for seeding. Stable across reloads (pure function).
export function hash32(...nums: number[]): number {
  let h = 2166136261 >>> 0
  for (const n of nums) {
    h = Math.imul(h ^ (n | 0), 16777619) >>> 0
  }
  return h >>> 0
}