# Design

## Context

`signalFetch(signal)` (`src/signal/fetch.ts`) returns a `fetch` bound to a signal and is meant for `fromSignal`, which `contextPlugin` reads. An effect elsewhere in the library takes `ctx` first (`retry(ctx, fn, options)`), and "outside a task pass `{}` or anything with a `signal`" (AGENTS.md). `effectsPlugin` puts any function whose first parameter takes `{ signal }` on `ctx`, bound to the task (`SignalFirst` in `src/core/effect-types.ts`; `docs/effects.md` shows `effectsPlugin({ fetchJson })`). So an effect with `ctx` first already has both forms, the direct call and `ctx.<name>`. See proposal.md for why.

## Goals / Non-Goals

**Goals:**
- One call in a handler that stops with the task, with no setup on the bus.
- `ctx.fetch` on every handler by one line, with no `fromSignal`.
- One helper, not two (no `taskFetch` next to `signalFetch`).

**Non-Goals:**
- `ctx.fetch` with no setup at all: it would put `fetch` in the core, which is at its size limit.
- A `fetchPlugin()` sugar. `effectsPlugin({ fetch: signalFetch })` is already one line.
- Axios and other clients as effects: they stay on `fromSignal`.

## Decisions

### D1. Change the signature of `signalFetch`; no new name
The owner chose to change `signalFetch` itself. `signalFetch(ctx, input, init)` is the effect. Alternatives:
- A new export beside the factory (`taskFetch`, `fetchWith`, `ctxFetch`): two helpers for one job, and the name of the old one would stay the better name. Rejected.
- An overload by the type of the first argument (signal or ctx): hard to read, and a type error is better than a guess. Rejected.

It is a breaking change of an API that is three minor versions old (0.31). The library is below 1.0 and the change is listed under `### Breaking` with a migration.

### D2. The first argument is `WithSignal`
`ctx: WithSignal` (what `retry` takes, `src/core/bus.ts`) so a task context and `{ signal }` fit, and `effectsPlugin` accepts the function (`SignalFirst`). `WithSignal` requires `signal` in the types, as for `retry`; `{}` is for plain JavaScript and works at run time (no signal, a plain `fetch`), as the docs say for every effect. The signature is written out, not `typeof fetch`: `fetch` has overloads, and `Strip` (the bound form) keeps only the last one. Written out: `(ctx: WithSignal, input: RequestInfo | URL, init?: RequestInit) => Promise<Response>`.

### D3. Body
`(ctx, input, init) => fetch(input, { ...init, signal: join(ctx.signal, init?.signal) })`, where `join` returns the one that exists, or `AbortSignal.any([a, b])` when both do, or none. The same lines as today minus the closure. The entry still grows by about 9 B (three parameters instead of one), and the `signal (plugin)` limit goes from 0.8 kB to 0.81 kB; a shorter body (a `join` helper, one `signal` variable) measured larger, not smaller.

### D4. `fromSignal` stays, with one less use
`fromSignal` is still the way to build a client that has no effect form (`axios.create({ signal })`). Docs no longer teach `fromSignal(signalFetch)`. For `ctx.fetch` on every handler the docs say `effectsPlugin({ fetch: signalFetch })`; for one handler, `signalFetch(ctx, url)`.

### D5. Tracking and lint need no change
- `devPlugin` counts a request that a task made and that kept running after the task was aborted. `signalFetch(ctx, url)` calls the global `fetch` with the signal of the task, so it is not counted; a test shows that, and that a bare `fetch(url)` still is.
- The lint rule with `requireContext: true` accepts a call "given `ctx`" and `ctx.fetch(...)`, so both `signalFetch(ctx, url)` and `ctx.fetch(url)` pass. A fixture line shows it.

### D6. Docs order
`docs/pass-the-signal.md` "Bind the signal once": the first snippet is `signalFetch(ctx, url)` in a handler; the second is `effectsPlugin({ fetch: signalFetch })` for `ctx.fetch` on every handler; a short block shows `fromSignal` for `axios` (as the page has it today). `docs/context.md` keeps "Build a field from the signal of each task" for clients, and its `signalFetch` bullet points to the effect form. The README is untouched.

## Risks / Trade-offs

- [Code that calls `signalFetch(signal)` or `fromSignal(signalFetch)` breaks] → a type error on the old call, and a note in `### Breaking`: `fromSignal(signalFetch)` becomes `effectsPlugin({ fetch: signalFetch })` (needs `import { effectsPlugin } from "nanoeffects/effects"`, and `contextPlugin` can go if `fetch` was its only field); `signalFetch(signal)(url)` becomes `signalFetch({ signal }, url)`. At run time `fromSignal(signalFetch)` would call the new effect with a signal as `ctx` and a missing `input`, so the first `ctx.fetch(url)` fails loudly, not silently.
- [`effectsPlugin` is a second plugin for a user who has `contextPlugin` only] → `NoClash` rejects a repeated `fetch` name, so a leftover `contextPlugin({ fetch })` is a type error, not a surprise.
- [Starter templates and docs that mention the old form] → all grep hits are in the tasks; `pnpm docs:check` fails on a stale name in a code block.

## Migration Plan

`CHANGELOG.md`, under `Unreleased` → `### Breaking`, with the two rewrites above. No code mod. The version bump (0.35.0, a minor below 1.0) is the owner's at release time.
