# Design

## Context

`type Signaled = { signal: AbortSignal }` is defined in `src/core/effect-types.ts`, used by `SignalFirst` and `Effect`, by `src/scope/effect.ts`, and exported from `nanoeffects/scope`. The root entry exports `WithType`, `WithPayload` and `WithContext` from `src/core/bus.ts`. `EffectContext` (`src/effects/run.ts`) is `{ signal, abort }`, the context that a starter of `all`, `race` and `allSettled` gets. See proposal.md for why.

## Goals / Non-Goals

**Goals:**
- One name for "an object that has a signal", where a person looks for it (the root entry).
- Nothing breaks and nothing grows at run time.

**Non-Goals:**
- A new name for the optional form, or for `EffectContext`.
- Changing how any effect uses a signal.

## Decisions

- **The name is `WithSignal`.** It follows `WithType`, `WithPayload` and `WithContext`: an object that has that part. `Signaled` is unclear and is taken; `Cancellable` is the effect `cancellable`; `HasSignal` and `SignalOptions` leave the family.
- **Defined once, beside `WithType`.** `WithSignal` is defined in `src/core/bus.ts`, and exported from `src/index.ts`. `Signaled` in `effect-types.ts` becomes `export type Signaled = WithSignal`, so `nanoeffects/scope` still exports it and every import keeps compiling. The architecture rule holds: `src/core` imports nothing from the layers above it.
- **Required only.** `WithSignal` has a required `signal`. The effects whose context may be missing (`retry(ctx, fn)` with `ctx: { signal?: AbortSignal }`, `all`, `race`, `timeout`, `delay`) take an optional signal on purpose, so that `{}` is a valid context outside a task (see AGENTS.md: "outside a task pass `{}`"). Replacing them would reject that call, so they stay as they are, and a type test pins the difference.
- **What fits.** The context of a task has `signal`, so it fits. So does `{ signal }`, and so does `EffectContext`, the `{ signal, abort }` of a starter, because a type with extra properties is assignable. An example written as `{ signal }: WithSignal` therefore works for a function that a policy calls with a context, and for a starter.
- **Where it is used.** In the library, the required forms: `poll` (two signatures), `cancellable`, `scope/effect.ts`. In the examples, the docs, the chat and the templates, every `{ signal: AbortSignal }` that a person copies. A JavaScript snippet has no types and does not change.
- **The templates and the release.** The templates import the type from the published `nanoeffects`, which has `WithSignal` only from the release that carries this change. The command rewrites the dependency to `^<version of the command>`, so a project made by that release compiles. The templates are type-checked against `src` by `pnpm templates:check`. A template change that ships before the type does would not compile for a user, so the release ships both, and the release notes are the place that says it.
- **Docs.** One short paragraph on `docs/typescript.md`: what `WithSignal` is, when to write it (a function that takes the signal of a task), and why the optional form of the effects is not it.

## Risks / Trade-offs

- [A template in a project made from an older `latest` does not compile] → the command pins the version of the release it belongs to; this is the same limit as for `useEventState`.
- [Two names for one type] → `Signaled` is kept as an alias for imports from `nanoeffects/scope` and is not documented again.
- [A reader confuses `WithSignal` with the optional signal of the effects] → the docs paragraph says which is which.

## Open Questions

None.
