# Design: `scopePlugin`

See `proposal.md` for why and what. Requirements are in `specs/scope-context/spec.md`.

## Context

- A task context is built in one place, `createTask` (`src/core/context.ts`): the fields of `bus.ctx`, then the fields of the library, then `bus.addContext(ctx)` (used by `effectsPlugin` and `contextPlugin`, chained).
- `emit` creates one task per listener (`callHandler`) and one for a command, all synchronously inside the call. A command call carries its command in a non-enumerable symbol (`commandCall`).
- `ctx.emit` reads `bus.emit` at the moment of the call, so a plugin that replaces `bus.emit` (as `devPlugin` replaces `bus.on`) also covers `ctx.emit`.
- `ctx.run` makes the child with `createTask` and the same bus; `forkTask` (modules, effects) copies the parent's fields.
- A module registers its handlers on the bus through `m.on` / `m.handle`, so the bus creates their tasks.
- `createBus` is about 1.3 kB gzip and must not grow; `src/core` imports nothing from `actions`, `dev`, `effects`, `policies`, `store`, `trace` (`architecture.test.ts`).
- The `effects-plugin` change is complete but not archived, and its spec says an unsupported helper is rejected. This change widens that; it has to be archived first (see Open Questions).

## Goals / Non-Goals

- Goals: no growth of `createBus`; one small mechanism for every place; a scope is a plain object that can be a `const` and shared; no leaks; a known, measured cost.
- Non-goals: a check or warning when the plugin is missing (decided: a scope is ignored); dynamic scopes that depend on the payload; a scope on policies or effects; changing `effectsPlugin`, `contextPlugin` or `createBus({ context })` besides the wider `Helpers`.

## Decisions

### 1. The whole feature is a plugin in its own entry

`nanoeffects/scope` exports `scopePlugin`, `effect` and the types. The core gets type-only additions (`Emit`, `On` overloads, scope types, an optional `Bus.applyScope`) and one file with the symbol (`Symbol.for("nanoeffects.scope")`) that `createBus` does not import, so the bundle of `createBus` does not change. Alternative: scope layers inside `createTask`; rejected, it grows the core and taxes every task.

### 2. How the plugin hooks in

- `bus.emit` is replaced by a wrapper. It finds the scope of the call (the symbol on an action or command call), takes the scope from the second argument when the first one is an object call (and removes that argument), puts both in a module-level `pending` list, runs the original `emit` in `try … finally` that restores `pending`, and returns its result. Tasks are created synchronously inside `emit`, so `pending` is the scope of exactly those tasks. Nested emits from handlers set and restore their own.
- `bus.addContext` is chained. For each new context it applies `pending` (and, for a child made by `ctx.run`, the fields of the parent) in the order of precedence: `context` copied (a function marked by `effect` is bound), `effects` bound with `ctx[k] = (...a) => f(ctx, ...a)`. Library fields are never replaced.
- Children: `ctx.run` of each context that has layers is wrapped so the handler of the child first takes the layers of its parent, bound to the child. `forkTask` copies the fields of the parent, and the module task gets its fields through `applyScope`.
- The layers of a task (the call's, and the module's) are kept on the context under a symbol, so that a child can take them and the module layer can be applied again under the call's layers (weakest first: module, then call). The keys of a scope are read each time it is put on a task, so a scope that is changed later is used as it is now.
- `bus.applyScope(ctx, scope)` is the slot the plugin sets for `modulePlugin`: it adds the module's fields to a handler's context unless the key is in the `WeakMap` record. Without the plugin the slot is absent and the module scope is ignored, as everywhere.

Because `effectsPlugin` always assigns (and `contextPlugin` skips keys that exist, so a scope wins over it in any order), `scopePlugin` must be used after `effectsPlugin`; and before `modulePlugin`, which mounts its modules when it is used and needs the plugin's slots by then. It is in the docs and in tests.

### 3. A scope travels with the call

`createAction(type, scope)` and `createCommand(…, scope)` keep the scope in the creator; the call (`creator(payload)`) puts it on `{ type, payload }` under the symbol (non-enumerable, like `commandCall`). `createJob` builds its command with the scope taken from its options. Plain `{ type, payload }` objects and the string form carry none. Cost in `nanoeffects/actions`: storing one reference.

### 4. Modules wrap what they register

`m.on`, `m.handle`, `m.use(command)` and `m.spawn` wrap the handler so it receives a context with the module's fields added through `bus.applyScope`. Unmount drops the wrappers with the rest of the module (already aborted tasks and removed listeners), so the scope is released with them.

### 5. A scope is flat

A scope has no `context` key: every key is a field, except the reserved `effects`. This is what a reader writes first (`{ api, cache }`), and `effect(fn)` already told bound and plain values apart at run time, so only the built-in effects (overloads that `effect(race)` would erase) need the second part. Cost: a field cannot be named `effects`; `createJob` takes the scope as its fourth argument, after `{ success, fail }`, so no key of the scope can clash with an outcome. In `emit` a field that neither the bus nor the call declares is an error, checked by the object literal itself.

### 6. Types

```ts
type Scope = { readonly effects?: Effects; readonly [field: string]: unknown };
type Merge<A, B> = Omit<A, keyof B> & B;
type ScopeFields<E, C, H> = Merge<ContextOf<E>, C & BoundOf<H, E>>;
type Scoped<E, C, H> = Omit<E, typeof contextKey> & WithContext<ScopeFields<E, C, H>>;
type WithScope<F> = { readonly [scopeKey]?: F };            // type only
type EmitScope<E, F> = Partial<ContextOf<E> & F> & { effects?: Partial<Effects> };
```

- `ActionCreator` and `CommandCall` get a defaulted type parameter `F` (`unknown`) with `WithScope<F>`; existing code and explicit generics (`createCommand<Mail, void>`) are not affected.
- `createCommand`, `createJob`, `createModule` take `C` and `H` from the scope and type the handler as `Task<P, Scoped<E, C, H>, R>`. `C` and `H` do not depend on the handler, so they are inferred before `ctx` is typed. This is the gate of task 1.3.
- `Merge` replaces a field of the bus with the one of the scope; a plain `&` would give `never` for two different types.
- `On` gets an overload for `ActionCreator<P, T, A, F>` before the existing creator overloads (the order is a decision in AGENTS.md). `Emit` gets a second parameter only on the two call forms.
- `Effects`, `Strip`, `Bound`, `BoundOf`, `Effect` and `Scope` live in `src/core` (types only) so that `effects`, `scope` and `actions` use them with no import cycle.

### 7. Generics of a user's effect

TypeScript keeps a generic only when the function is the direct argument of a generic call; a mapped type, a fixed-key object signature, a brand or a factory all turn `<T>` into `unknown` (all tested). So there are three ways, from the lightest:

1. A plain function in `effects`: `Strip` removes the first parameter; the generic is erased. Documented.
2. `Effect<F>`: `type Effect<F> = ((ctx: { signal: AbortSignal }, ...a: Parameters<F>) => ReturnType<F>) & { readonly [bound]?: F }`. The function carries its bound type `F` in a type-only property, and `BoundOf` takes `F` when it is there. Tested: `first(["s"])` is `string`, `first([1])` is `number`, and plain functions in the same object still work. The user writes the bound shape once.
3. `effect(fn)` in `context`: `effect = <A extends unknown[], R>(fn: (ctx: { signal }, ...a: A) => R): (...a: A) => R`. The call keeps the generic; at run time `fn` is recorded in a `WeakSet`, and the plugin binds a `context` value found there. No annotation, so JavaScript editors show the exact hint. It works only in a scope, because the plugin does the binding.

Alternatives rejected: `withEffects(obj)` (cannot keep `<T>`, tested); a helper that returns a branded function from `effects` (the brand loses `<T>`, tested); typing entries of `effects` by name (a function the user forgot to wrap is typed wrongly in silence).

### 8. Inference of `ctx` is a gate, not a hope

Handlers must see the scope fields typed. Task 1.3 proves it before any run-time code. If `C` and `H` are not inferred before `ctx`, the choice is made then: the scope as the second argument, or a builder (`createCommand("x").with(scope).handle(fn)`). Run-time work does not start on a form that cannot infer.

### 9. The first parameter of an effect

The constraint is `(ctx: { signal: AbortSignal }, ...args: any[]) => unknown`. An effect declared with the full `Context<E>` as its first parameter is rejected by `strictFunctionTypes`; that matches the free `retry(ctx, …)`, where `{}` or any object with a signal works. The docs show the `{ signal: AbortSignal }` annotation.

## Risks / Trade-offs

- [`pending` is module-level state] A throw or a nested emit could leave a scope behind. → `try … finally` restores the previous value; a test throws from a listener and from a nested emit and checks the next emit sees nothing; a test with two buses in one tick.
- [Async code does not see `pending`] Tasks made later (`ctx.run`, effects) are not inside `emit`. → They inherit from the parent through the wrapped `ctx.run` and `forkTask`; a test with a child made after an `await`.
- [Plugin order] `effectsPlugin` assigns over a scope. → Documented, tested; `scopePlugin` last.
- [A scope is ignored without the plugin] Decided. The types promise fields the runtime will not have. → Documentation says it in the first lines of `docs/scope.md`; no code for it.
- [Per-task cost with the plugin] `addContext` runs for every task and wraps `ctx.run`. → Benchmark in task 4.2 with a recorded budget; if an empty-scope task is too slow, wrap `run` only when a call layer exists.
- [`Omit` on an event map] `Omit<E, key>` of a map with an index signature loses keys. → `types.test.ts` has a case with a literal map and one with `EventMap`; fall back to a mapped type if `Omit` is not exact.
- [Inference does not reach `ctx`] See decision 8.
- [Wider `effectsPlugin`] It accepts any `{ signal }` function; the old "unsupported helper" error is gone. → It is the point of the change; the types still reject a function that cannot take `{ signal }`.

## Budgets and what was measured

`createBus` is byte for byte the same file as at HEAD (4190 B raw, 1748 B brotli with its chunks). `node --expose-gc scripts/bench-scope.mjs dist <dist-of-HEAD>`, best of 7 rounds, Node 24:

| Measure | Rule | Measured |
|---|---|---|
| `createBus` brotli | equal to HEAD | 1748 B, equal |
| 100 000 tasks, no plugin | equal to HEAD within the noise | 14.1 ms HEAD, 14.4 ms now |
| 100 000 plain emits, plugin | at most 1.5 times the no-plugin time | 16.7 ms (1.15 times) |
| 100 000 commands, plugin, no scope | at most 1.5 times a command without the plugin | 29 to 30 ms against 29 to 31 ms (1.0 times) |
| 100 000 commands, plugin, scope of 3 fields | at most 2.5 times a command without the plugin | 60 ms (2.1 times) |
| 100 000 commands with a new scope object in each `emit` | no rule | 62 ms (2.2 times): the same as a scope kept in a `const`, because the values are read each time |
| 10 batches of 10 000 tasks with a scope | batch 10 within 20% of batch 1; heap stable | 7 ms in batch 1, 6 to 10 ms after; heap 4.3 MB in each batch |

Getting there took one rewrite: the first version bound every field with `Object.entries` and wrapped `ctx.run` through `Reflect`, and a command with a scope cost 130 ms. The task context is now touched with plain properties and the keys of a scope are read with `Object.keys` each time; an earlier version cached the values in a plan, which was faster (47 ms) but ignored a scope that was changed after its first use, so it was dropped after review.

`nanoeffects/actions` grew from 1.84 kB to 2.07 kB brotli (about 230 B): the scope kept in a call, the arguments of `createAction`, `createJob` and `createModule`, and the module wrapping. This is more than the "few bytes" the proposal expected; the limit in `package.json` is moved from 1.85 kB to 2.1 kB. `nanoeffects/scope` is 691 B, limit 0.75 kB. The time numbers live in a script, not in a test, because wall time is not a stable test; the leaks and the batch check are tests.

## Migration Plan

All new arguments are optional and the plugin is opt-in, so there is nothing to migrate. Release with the next minor; CHANGELOG `Unreleased`. Rollback is removing the entry and the arguments.

## Open Questions

- Archive `effects-plugin` before this change is archived, so the "Unsupported helper is rejected" scenario can be amended with a delta instead of left to contradict `scope-context`. Does not change the code or tasks.
