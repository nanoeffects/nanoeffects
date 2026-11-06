# Proposal

## Why

The five policies cover the usual races (`latest`, `leading`, `debounce`, `throttle`, `queue`), but four jobs are still written by hand in every app: share one request between callers that ask for the same thing, skip a call whose payload did not change, stay under a quota of an API, and send many small calls as one. The owner decided to add them now, knowing that "the surface does not grow without demand" (AGENTS.md) is the default; this change records that decision and keeps each policy as small as the existing ones.

## What Changes

- Add `dedupe(fn, options?)`: calls with the same key that arrive while a run is going share that run and get its result or its error. Nothing is cached after the run settles.
- Add `distinct(fn, options?)`: a call whose payload equals the payload of the last accepted call (for that key) is skipped and resolves with `undefined`. Only the last payload is remembered, never a result.
- Add `rateLimit(limit, ms, fn, options?)`: at most `limit` runs start in any window of `ms` (sliding window). A call over the limit waits its turn, or is dropped with `overflow: "drop"`.
- Add `batch(ms, fn, options?)`: payloads that arrive in a window of `ms` (or until `maxSize`) are handed to `fn` once, as an array. Every caller resolves with the result of that one run.
- All four are built on `keyed()`, take `key`, report the call lifecycle to jobs, use `setTimer` / `clearTimer`, read options with `??`, and take the curried form like the other policies (`dedupe(options)(task)`).
- Docs: `docs/policies.md` (table, entries, one recipe each), `docs/ru/policies.md`, the `nanoeffects/policies` row of `docs/package.md`, `docs/plugins.md` where it lists policies, `llms.txt`, `docs/recipes.md` for the dedupe case. `CHANGELOG.md` gets an `Added` entry under `Unreleased`.
- Trace: four names are added to `EffectName` so these policies show up in traces.
- No change to `createBus`, no new entry point, no breaking change.

## Capabilities

### New Capabilities
- `policy-dedupe`: `dedupe`, in-flight sharing of one run between calls with the same key.
- `policy-distinct`: `distinct`, skipping a call whose payload did not change since the last accepted one.
- `policy-rate-limit`: `rateLimit`, a sliding window that limits how many runs start per period.
- `policy-batch`: `batch`, collecting payloads for a window and running `fn` once with all of them.

### Modified Capabilities
<!-- None: the existing policy specs enumerate the five old policies in prose; their requirements stay true. The lifecycle contract of the new policies is stated in each new spec, and `policy-lifecycle` gets one ADDED requirement. -->
- `policy-lifecycle`: ADDED requirement that the four new policies report starts, drops, cancels and outcomes as the old ones do.

## Impact

- Code: `src/policies/` (four files, four test files, `index.ts` re-exports), `src/core/types.ts` (`EffectName`), tests in `src/tests/` (`exports.test.ts`, `plugin-matrix.test.ts`, `types.test.ts`).
- `package.json` size-limit: the `policies (all)` limit (2.71 kB) grows by the measured size of the four; limits of other entries do not change. `createBus` is untouched.
- `withPolicy` and `usePolicy` work with the new policies without a code change; tests prove it.
- Docs and examples as listed above; `pnpm docs:check` covers every new snippet and the Russian page.
