# Proposal: put selected effects on the task context with `effectsPlugin`

## Why

Handlers call `race(ctx, …)`, `all(ctx, …)` and the like. Passing `ctx` every time is noise. The wanted shape is `bus.on("load", (id, { race, all }) => …)`, destructured like `signal`. The helpers must stay tree-shakeable and `createBus` must not grow.

## What Changes

- `effectsPlugin(helpers)` in `nanoeffects/effects`: `bus.use(effectsPlugin({ race, all, take }))`. It returns the same bus typed `Bus<E & WithContext<…>>`, so one binding carries the new fields.
- Core hook: `Bus` gets an optional `addContext(ctx)`; `createTask` calls it once, after the context object exists (`bus?.addContext?.(ctx)`). No symbols, no scan of context fields.
- The plugin sets `addContext` to add one arrow per passed helper (`(…args) => helper(ctx, …args)`). With several plugins, `addContext` chains to the previous one.
- Supported helpers: `race`, `all`, `allSettled`, `take`, `delay`. Their bound types are written by hand (no overload inference). `retry` / `timeout` / `poll` are not supported: their bound shape would look like the handler wrappers of the same name.
- Docs: one section in `docs/effects.md` and one link from `docs/context.md`. The guide, README and other sections of `effects.md` stay as they are.

## Non-goals

- A new `createBus` option; changing `commandsPlugin` / `modulePlugin` / `devPlugin`; changing the `(payload, ctx)` handler signature; a `BusPlugin` type or a spec for the "plugin returns Bus" convention (one line in `AGENTS.md` is enough).

## Impact

- `src/core`: one optional field and one line in `createTask`. Measure `createBus` gzip before and after (expect ≈ +20 bytes) and task creation cost with no plugin (one property read).
- `src/effects/plugin.ts`: small. Public exports: `effectsPlugin` only.
- Tests: runtime parity with free forms, merge with existing `context`, abort parity, child tasks (`ctx.run`, `retry` attempts) get the helpers, leak test with `WeakRef`; type tests for handler inference and accumulation with `WithContext<{ store }>`.
