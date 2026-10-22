# Tasks: backoff

## 1. backoff
- [x] 1.1 `src/effects/backoff.ts`: `backoff`, `BackoffOptions`, doc comment with `@example`; formula, cap, full jitter via `Math.random`, `??` defaults, negative / `NaN` to 0
- [x] 1.2 Export from `src/effects/index.ts` (re-exports only)
- [x] 1.3 `src/effects/backoff.test.ts`: growth, cap, jitter bounds, fixed `Math.random`, `null` options, use inside `retry` with fake timers (pauses 100 and 200), use inside `poll`

## 2. Docs
- [x] 2.1 `docs/effects.md`: "Back off between retries": plain `delay` function first, then `backoff` with cap and jitter, and why jitter; point the hint in "Options for retry, timeout, and poll" at it
- [x] 2.2 `examples/`: a type-checked example of the recipe
- [x] 2.3 `CHANGELOG.md` Unreleased entry

## 3. Verify
- [x] 3.1 `pnpm size`: `nanoeffects/effects` within its limit
- [x] 3.2 `pnpm format && pnpm tsgo && pnpm check && pnpm vitest run && pnpm build`
- [x] 3.3 `pnpm verify`
