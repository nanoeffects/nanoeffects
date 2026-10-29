# Design

## Context

The tracing types are defined in `src/core/types.ts` (`EffectName`, `Phase`, `TraceEvent`, `TraceLogger`, `Trace`) and `src/core/tracer.ts` (`Tracer`), because the bus needs the contract and holds none of the machinery. `src/index.ts` re-exports them, and also `anyEventType`, `commandCall`, `ContextTask` and `NoClash`. `src/trace/index.ts` exports the code and none of the contract types; `src/context/index.ts` exports `contextPlugin` and the two context types. `src/effects/plugin.ts` uses `NoClash` in the signature of `effectsPlugin`. The `trace` entry has no `notrace` build. See proposal.md for why.

## Goals / Non-Goals

**Goals:**
- A logger author imports every tracing type from `nanoeffects/trace`.
- The root entry is `createBus` and the types the bus needs.
- Each type has one home, so no import path is a guess.

**Non-Goals:**
- Moving the definitions out of `src/core`.
- A deprecation period: there are no users of the library yet.
- A change in the `notrace` build, in `Tracer` itself, or in the runtime of any plugin.
- The version bump and the release.

## Decisions

**Re-export from the trace entry, define in the core.** `src/trace/index.ts` gets `export type { Tracer } from "../core/tracer"` and `export type { EffectName, Phase, Trace, TraceEvent, TraceLogger } from "../core/types"`. The core keeps the definitions, because `BusOptions.trace` is a `Tracer` and `src/tests/architecture.test.ts` forbids `src/core` from importing `src/trace`. A re-export is the same declaration, so the types are equal by construction. Alternative: move the definitions into `src/trace`. Rejected: it reverses the dependency that the architecture test guards.

**Remove from the root, with no deprecation first.** The six tracing types, the two keys and the two context types leave `src/index.ts`. Alternative: keep them and mark them `@deprecated`, remove later. Rejected: nobody uses the library, so a deprecation period is only noise, and a later removal would be a real break. The 0.14.0 choice to keep `NoClash` and `ContextTask` in the root is reversed on purpose: the entry of the plugin is where a reader looks.

**The internal keys are not part of the public surface.** `anyEventType` and `commandCall` are symbols that plugins and the action creators share. They stay exported from `src/core/bus.ts`, and the code that needs them imports them from there, as the tests already do. Nothing in `docs/` or `examples/` uses them. Alternative: an `nanoeffects/internal` entry. Rejected: nobody needs them outside the package.

**The root test is the contract.** `src/tests/exports.test.ts` lists the runtime names of the root; it becomes `["createBus"]`. The type exports have no runtime test, so `src/tests/types.test.ts` gets `@ts-expect-error` imports of the removed names from the root and positive imports from the new homes.

**The bundled declarations decide whether a removed type is still reachable.** `effectsPlugin` names `NoClash` in a signature, and `BusOptions` names `Tracer`. tsdown bundles the declarations, so a type that a signature names is still in the `.d.ts` even when it is not exported; a person who needs to write it imports it from `nanoeffects/context` or `nanoeffects/trace`. The task that builds the package checks this with `pnpm build`, `pnpm lint:package` and `pnpm consumer-check`.

## Risks / Trade-offs

- [A removed name is used somewhere in the repo] → search `src`, `docs`, `examples`, `integration`, `skills` and `scripts` before removing; `pnpm tsgo` and `pnpm docs:check` find the rest.
- [The bundled `.d.ts` of the root loses a name that a signature uses] → build and run `pnpm lint:package` (publint and attw); see the decision above.
- [A user who wrote against 0.15.0 breaks] → the release is a minor in 0.x with a `### Breaking` section that says where each name went. The risk is small because nobody uses the library yet.
- [The `trace` entry now has types that come from a shared chunk] → `pnpm size` for `trace` is unchanged because the types are erased.
