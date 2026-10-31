# Proposal

## Why

A reader meets two creators with one shape, `createAction("user/loaded")` and `createCommand("mail/send")`, and the registry that binds work to them is called `commands`. The reader has to learn the difference before writing the first handler, although the difference is small: an action may have work that answers it, and that work may be given where the action is made or bound later.

One concept is enough: **an action**. It may have a handler (then `emit` returns the result, and the docs call it a command), or none (then it is an event). The registry that binds handlers to actions should be named for what it holds.

## What Changes

- `createAction` takes the handler in the form `createCommand` had: `createAction(type, handler?, scope?)`, e.g. `createAction("user/get", (id, { signal }) => fetchUser(id, { signal }))`. `bus.emit(getUser("1"))` runs the handler as a task and returns its result. The second argument can also be one options object, `createAction(type, { handle, prepare, ...scope })`: `handle` and `prepare` are reserved function fields, the rest is the scope, and a scope alone still works. `prepare` works together with a handler. **BREAKING**: `createAction(type, fn)` used to mean `prepare` and now means the handler; the migration is `createAction(type, { prepare: fn })` (used once in the repo).
- **The registry binds a handler to any action**, also to one made without a handler: `actions.handle(userLoaded, fn)` or `setHandler(userLoaded, fn)` makes `bus.emit(userLoaded(user))` run `fn` and return its result. An action with no handler of its own and none bound stays a plain event (`onUnhandled` applies, nothing throws), as now. To let the bus know, `emit` asks the registry for the type once (see `design.md`; a few bytes in `src/core`, measured).
- **BREAKING** (0.x, minor release, no aliases): `bus.commands` → `bus.actions`, `commandsPlugin` → `actionsPlugin`, `app.commands` → `app.actions`, the `Commands` interface of the core → `Actions` (it also gets an optional `bound`). `setHandler`, `actions.handle`, `m.handle` and `m.use` keep their names. The migration is a search and replace.
- **Types for the result of a string emit**, so users who do not make creators lose nothing: on a bus without an event map `bus.emit<string>("user/getId")` gives the hint; with a map an entry `Call<Payload, Result>` gives the result type; plain entries and checks are unchanged. Types only.
- **`createCommand` is removed** (no alias): `createAction` does all it did, so there is one entity. `createCommand(type, fn, scope)` → `createAction(type, fn, scope)`; `createCommand<P, R>(type)` → `createAction<Call<P, R>>(type)`. A handler-less action is an event, so the fail-fast `MissingHandlerError` stays only for a job without a handler. `createJob` is unchanged.
- Docs lead with `createAction` and a handler. Binding a handler in the registry, and the typed contract, are the later "complication".

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `command-action-call`: an action creator can carry a handler (the second argument is the handler or one `{ handle, prepare, ...scope }` object; `prepare` works with a handler); an action with a handler behaves as a command; `createCommand` is removed and a declared result type is `Call<P, R>`; typing of the result of a string emit.
- `command-registry`: the registry is `bus.actions` / `actionsPlugin`; it binds a handler to any action; an action nobody handles is an event.
- `module-commands`: `app.commands` is `app.actions` (two requirements).
- `command-match`, `scope-context`, `trace-group`, `app-module-factory`, `starter-templates`: the examples and names that said `createCommand` (one requirement each).
- `bus-plugins`: `actionsPlugin` in the list of plugins that work in any order.

## Impact

- Code: `src/actions/action.ts` takes `createCommand`'s code (kept internal for `createJob`, not exported); `src/core/bus.ts` (rename of the `commands` slot and `Commands` interface; `emit` asks the registry for a handler of the type; `src/core/types` if the slot is typed there), `src/actions/command.ts` (rename, `bound` in the registry), `src/actions/action.ts` (the handler as the second argument, `prepare` as an option), `src/actions/module.ts` (`app.actions`), `src/index.ts` and the entries that re-export `commandsPlugin`, `src/dev` and `src/trace` where they read `bus.commands`.
- Size: `createBus` grows by the measured bytes of one lookup; the number goes into `design.md` and `package.json` `size-limit` only if the limit needs it.
- Tests: action, registry, module, job, trace, plugin matrix, types, the notrace build.
- Docs and examples: every page and example that says `commands` or `commandsPlugin`; `CHANGELOG.md` (`### Breaking`, `### Added`); `packages/create-nanoeffects` templates if they use the names.
