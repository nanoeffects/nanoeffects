# Design: `backoff`

## Context

`retry` takes `delay` as a number or `(attempt, error) => ms` (`src/effects/retry.ts`). `docs/effects.md` shows `2 ** attempt * 100` as a one-liner. What is missing is a cap and jitter in a ready form.

## Decisions

**1. `backoff` returns a plain function.** `backoff(options)` gives `(attempt) => ms`. It reads no signal and no error and has no state, so it works for `retry`, `poll` and `delay(ctx, fn)`. Formula `min(max, base * factor ** (attempt - 1))`, then full jitter `random * pause` (AWS "full jitter": clients do not retry together). Equal and decorrelated jitter are not offered; one clear option wins.

**2. `poll` counts calls from 0**, so for `poll` the first pause is `base / factor`. The docs show `retry` only and mention this in one line.

**3. Where it lives.** `src/effects/backoff.ts`, exported from `nanoeffects/effects`. It is a helper, not an effect, but `retry` is there and imports stay together. A few lines, tree-shaken when unused. No change in `src/core`.

**4. Options that are `null`** use `??`, not destructuring defaults (AGENTS.md). Negative and `NaN` `base` / `max` become 0, in line with the timers.

**5. Docs order.** `docs/effects.md` keeps the plain `delay: (attempt) => …` line first (level C, no import needed) and introduces `backoff` as "when you also want a cap and jitter", with the reason for jitter. JS snippet, each library call commented, names defined in the snippet.

## Risks

- Full jitter can give a pause near 0 on a retry. The docs say so and show `base` as the upper scale, not a minimum.

## Migration

Additive. Existing `delay` functions keep working.
