# Proposal: `scopePlugin`, a scope of context fields for actions, commands, jobs, modules and `emit`

## Why

Context fields (`store`, `http`, `race`) can be set only for the whole bus (`createBus({ context })`, `contextPlugin`, `effectsPlugin`). A command that needs its own client, a module that needs its own logger, or a test that needs one call to use a fake all have to rebuild the bus or pass the value by hand. The fields should be pinned to the thing that uses them, and be overridable per call. `createBus` must not grow for it: the whole feature is a plugin.

## What Changes

- New entry `nanoeffects/scope` with `scopePlugin()`, `effect(fn)` and the types `Scope`, `Effect`, `Scoped`. `bus.use(scopePlugin())` switches scopes on. Without it a scope is ignored without a word (decided: no check in the core, in the types or in `devPlugin`).
- One optional plain object, a **scope**. Every key is a context value and goes on `ctx` as it is, except `effects`.
  - A value: put on `ctx` as it is. A function made by `effect(fn)` is bound to the task instead, and keeps its generics.
  - `effects`: functions whose first parameter is `{ signal }` (the built-in `race`, `all`, `allSettled`, `take`, `delay`, or the user's own). They are bound to the task like `effectsPlugin` does: `ctx.fetchJson(url)` calls `fetchJson(ctx, url)`.
- Where a scope can be given:
  - `createCommand(type, handler, scope)`;
  - `createJob(type, handler, { success, fail }, scope)`, the scope after the outcomes, so its keys cannot clash with `success` and `fail`;
  - `createAction(type, scope)` and `createAction(type, prepare, scope)`;
  - `createModule(name, setup, scope)` and `app.createModule(name, setup, scope)`;
  - the second argument of `emit` and `ctx.emit` for the call forms: `emit(creator(payload), scope)`, `emit(command(payload), scope)`.
- Precedence: `emit` overrides action/command/job, which overrides module, which overrides bus. A stronger layer replaces a field of the same name. Library fields (`signal`, `emit`, `run`, …) always win. Child tasks inherit the fields of their parent. `scopePlugin` is used last, after `effectsPlugin` and `contextPlugin`.
- Generics of a user's effect:
  - the type `Effect<F>` (in `nanoeffects/scope`) says what the effect looks like after it is bound, and `effects` keeps the generics;
  - `effect(fn)` as a value of the scope keeps them from the code itself, with no annotation (JavaScript editors show the exact hint);
  - a plain function in `effects` gets its first parameter removed and its generics erased (documented).
- `effectsPlugin` accepts any function whose first parameter is `{ signal }`, not only the five built-in effects, and reads `Effect<F>`.
- Types: handlers see the merged fields without hand-written `WithContext`; `emit` checks an override against the type of the field it replaces.
- Checks that this change ships with: leak tests (`WeakRef`), a benchmark of task creation without a plugin, with an empty scope and with a scope, and a size limit for the new entry.
- Docs: a new page `docs/scope.md` with examples for each place a scope can be given, a short section in `docs/context.md`, `docs/actions.md` and `docs/effects.md`, a type-checked file in `examples/`, the entry in `llms.txt`.

## Non-goals

- A string-form `emit("x", payload, scope)`: the payload is a rest argument, the third argument would be ambiguous. Use `emit(creator(payload), scope)`.
- A warning or an error when a scope is given and `scopePlugin` is not used.
- `effect(fn)` in `createBus({ context })` or `contextPlugin`: only the plugin binds it.
- A context field named `effects` in a scope: the name is reserved.
- Renaming `effects` or `effectsPlugin`; a scope for `bus.on`, policies or effects (`retry`, `timeout`, …).

## Capabilities

### New Capabilities

- `scope-context`: pinning context fields and bound effects to actions, commands, jobs and modules, overriding them per `emit`, their precedence, types, and the cost limits (no growth of `createBus`, no leaks).

### Modified Capabilities

None. `effectsPlugin` accepting any `{ signal }` effect is stated in `scope-context`, because the `effects-plugin` change is not archived yet (see design).

## Impact

- `src/scope/` (new): the plugin, `effect`. `src/core`: type-only additions (`Emit`, `On`, `Bus.applyScope?`, scope types) and a one-line symbol file that `createBus` does not import. `src/actions/{action,command,job,module}.ts`: take and keep the scope. `src/effects/plugin.ts`: wider `Helpers`, reads `Effect<F>`.
- `package.json`: export `nanoeffects/scope`, `size-limit` entry, `tsdown` entry; `publint` and `attw` must pass.
- Public API: new optional arguments, one new entry. CHANGELOG `Unreleased`.
- `createBus` bundle: unchanged (verified). `nanoeffects/actions` grows by the few bytes that keep a scope in a call.
