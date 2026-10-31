# Design

## Context

See `proposal.md` for the motivation. What exists today:

- `createCommand(type, handler?, scope?)` returns a callable that builds a branded call when called with a payload and runs the handler when the bus calls it with `(payload, ctx)`. The bus knows a command from the brand on the call (`makeCommandCall`, `commandOf` in `src/core/bus.ts`).
- `createAction` returns a creator that only builds `{ type, payload }`. An emitted action that nobody hears goes to `onUnhandled`; a command never does.
- The registry (`commandsPlugin`, `bus.commands`) keeps handlers in a `Map` keyed by the **type string**, and `bus.commands.run` is consulted for commands only.
- The second argument of `createAction` is today `prepare` (a function returning `{ payload }`) or a scope (a flat object whose keys go on `ctx`); `createCommand` has `(type, handler?, scope?)`.

## Goals / Non-Goals

**Goals:**
- One concept: an action, with or without a handler. The handler is given to `createAction` in the form `createCommand` had, or bound in the registry, for any action. `createCommand` goes away.
- A bus that never uses the registry pays nothing at run time beyond one optional-chain check.
- Every old call of `createCommand` moves to `createAction` by a rename, and every old call of `createAction` keeps working except `createAction(type, prepare)`, which becomes `createAction(type, { prepare })`.

**Non-Goals:**
- Making the type of a handler flow from `setHandler` / `handle` to `emit` by itself: TypeScript has no state shared between two calls, and the library has no global interface. The result type comes from the creator, from the event map or from a hint, never from the registry.
- Deprecated aliases for the old names, `createCommand` included.

## Decisions

### `createAction` takes `createCommand`'s form; the code moves with it

`createAction(type, handler?, scope?)` is the signature of `createCommand`, which the owner finds convenient, so the code of `createCommand` becomes the body of `createAction` (and a function not exported, `makeCommand`, for `createJob`, which is built on it). One code path, so the brand, the registry override, policies (`wrap`), tracing (`"command"` phase), scopes, `module.use` and `createJob` need no change. `createCommand` is removed from `nanoeffects/actions` with no alias.

One rule covers every form: the options object of `createAction` is a scope that may carry two reserved function fields.

| Call | Meaning |
| --- | --- |
| `createAction(type)` | a plain event |
| `createAction(type, handler)` | a handler (the form of `createCommand`) |
| `createAction(type, handler, { prepare, ...scope })` | a handler, with the third argument as options and scope |
| `createAction(type, { handle, prepare, ...scope })` | everything in one object: `handle` and `prepare` are taken out, the rest is the scope |
| `createAction(type, scope)` | a scope alone, as now |

A function second argument is the same as `{ handle }`. `handle` and `prepare` are reserved only when their value is a function, so a scope field that has another value or another name is untouched; a scope that already used a function field with one of these names has to rename it (named in the changelog). `createAction(type, fn)` used to be `prepare`; it is used once in the repo (a test and a doc line), so it is the one old form that changes meaning, with the migration `createAction(type, { prepare: fn })`.

### `prepare` works with a handler

A handler is run as `command(payload, ctx)`, and today the creator tells that call from "build the call" by `typeof ctx === "object"`. With `prepare` the user's arguments can be objects too, so the creator needs a stronger sign: the creator tells a task context by what it has: `signal` that is an `AbortSignal` and an `emit` function, which the arguments of a user's creator do not have in practice. The call it builds keeps the payload that `prepare` made, so the handler receives that payload and the context, as for any command. Everything is in `src/actions`; a marker symbol in `src/core` was considered and left out because it costs `createBus` bytes for no gain.

*Alternatives:* `createAction(type).handle(fn)` makes the creator mutable; leaving `prepare` out was considered and rejected by the owner (it stays, with the object form).

### A declared result type: `Call<P, R>` as the payload generic

`createCommand<Mail, void>("mail/send")` had no handler and a result type. Its place is `createAction<Call<Mail, void>>("mail/send")`: `Call<P, R>` is the same marker as in the event map (see below), read by `createAction` as "payload `P`, result `R`". A creator that has no handler and nothing bound is an event, so `emit` returns `undefined` at run time while the type says `R`: the type is a promise of the author, as for `emit<R>`.

### The registry is asked by type, not by a mark on the call

To bind a handler to an action made without one, the bus must find the handler for a call that carries no mark: creators are never bound to a bus, so a call cannot know whether a handler will be bound. The registry already keys handlers by type string, so the core asks it:

```ts
// src/core/bus.ts, in emit: after the brand of the call, before onUnhandled is decided
const command = commandOf(event) ?? bus.actions?.bound?.(key);
```

`Actions` becomes `{ run(command, payload, ctx); bound?(type): Command | undefined }`, with `bound` optional so a custom runner `{ run }` keeps working (it simply does not handle actions that have no handler of their own); `bound` returns a command-like function with that `type` when a handler is bound for it (the registry already builds `routed` from the bound function), `undefined` otherwise. `emit` then follows the path of a command: listeners first, then a task that `run`s it, `traceRun(ctx, "command", …)`, the result returned. `onUnhandled` is decided after that, so a bound handler counts as handled.

- It works for a plain `{ type, payload }` and for the string form `bus.emit("user/loaded", user)`, because it looks at `key`.
- It is evaluated for every emit of a bus that has `actions`, a `Map` lookup; a bus without `actions` pays one `undefined` check.
- Order of plugins does not matter: `bound` is read at each emit, so a registry attached later, or replaced by `bus.actions = …`, is seen at once. The plugin matrix gets a probe for it.
- **Cost:** one expression and one method on the interface in `src/core`. Measure `createBus` alone with rolldown and brotli before and after, and put both numbers in the commit; the limit in `package.json` moves only if it must. Worth it because it is what makes the registry work with *any* action; without it the contract case would need a second creator.

*Alternative:* brand every call that `createAction` builds, so the bus can recognise it. Rejected: it costs a `defineProperty` per call on a hot path, does not help the string form, and still needs the registry to be asked before `onUnhandled`.

### Renames, no aliases

`bus.commands` → `bus.actions`, `commandsPlugin` → `actionsPlugin`, `app.commands` → `app.actions`, `Commands` → `Actions`. The package is 0.x, so this is a minor release with a `### Breaking` entry and a migration that is a search and replace (`commandsPlugin` → `actionsPlugin`, `.commands` → `.actions`); a second name for the same slot would be another thing for `bus.use` order and the plugin matrix to carry. `Registry` and `Binding` keep their names.

### `setHandler` and `handle`

`bindHandler` is renamed `setHandler` (owner's choice: it reads better). `setHandler(action, fn)` is a function that builds a binding for `actionsPlugin([...])` and accepts any action; `actions.handle(action, fn)` binds later and returns the unbind. They are the registry's two verbs. No alias for the old name, like the other renames.

### Result type of a string emit: a hint without a map, `Call` with one

Users who never make creators call `bus.emit("user/getId")` by string, so the type has to come from somewhere they already control:

- **No event map** (`createBus()`): an overload `emit<R = void>(type: string extends EventKey<E> ? string : never, ...payload: unknown[]): R`, first in `Emit` (placed last, the `K extends string` overload of an untyped bus took `emit<string>("x")` and returned `void`). With `E` without a map the parameter is `string`, so `bus.emit<string>("user/getId")` is `string` and a plain `bus.emit("x")` stays `void`. On a bus with a map the parameter is `never`, so the overload cannot be chosen and no check is lost; a prototype showed that a plain loose overload would hide wrong payloads and misspelt names, which is why it is conditional.
- **Event map**: `Call<Payload, Result>` is a type-only marker (a unique symbol key, so it cannot be mistaken for a payload that has `payload` and `result` fields). `EventPayload` and the `emit` overloads read it; a plain entry means a payload as before. It is exported from the main entry as a type, which a bundler drops.
- A result type is a promise of the author: nothing ties it to what `setHandler` / `handle` binds. Document that; a handler on the creator is the checked way.

### `createCommand` and `MissingHandlerError`

`createCommand` is removed. Its fail-fast (a forgotten binding is an error at the first emit) goes with it: an action without a handler is an event, as decided. `MissingHandlerError` stays for a job without a handler, which is a command by construction. A caller who wants a fail-fast contract can add a listener that throws or check `onUnhandled`; a stricter option may come later. `createJob` needs no change: `actions.handle(job, fn)` already overrides its handler, and a test pins that it works when the registry binds the handler.

### Modules

`m.use` still brings commands that carry a handler (an action made with `handle` is one). `m.handle(action, fn)` now also accepts an action made without a handler, since it is a binding in the registry. The module plugin uses or attaches `actionsPlugin()` as before.

### Docs order

`docs/actions.md` already leads with a command that has a handler. Its first example becomes `createAction("math/double", (value) => value * 2)`, saying that an action with a handler is a command and one without is an event. The registry section (binding later, per-bus override in tests) follows, with the new names and a `createAction` bound in the registry; the typed contract with `createCommand` is the last part. `guide.md`, `plugins.md`, `scope.md`, `query-libraries.md`, `chat-example.md`, `package.md`, `hmr.md` and the `examples/` follow.

## Risks / Trade-offs

- [`emit` of a bus with `actions` does a lookup for every event] → a `Map.get`; measure with `scripts/bench-*` style loop and the 50 000 subscribers test; the lookup is skipped when the bus has no `actions`.
- [A bound handler on a plain action changes what `emit` returns at run time, while its type says `void`] → documented in `docs/actions.md`: use a handler on the creator, `Call<P, R>` or the hint when the result matters.
- [`createAction(type, fn)` used to mean `prepare`, and now means a handler] → documented as `### Breaking` with the one-line migration `createAction(type, { prepare: fn })`; TypeScript reports a `prepare` that is used as a handler when its result is not a result type; a test pins the new form.
- [Breaking rename] → minor release in 0.x, `### Breaking` with the search-and-replace migration; `pnpm tsgo` points at each use.
- [`createBus` size] → measured as above; the notrace build is measured too.

## Migration Plan

1. `commandsPlugin` → `actionsPlugin`, `bindHandler` → `setHandler` and `.commands` → `.actions` (also `app.commands`, `bus.commands = { run }` → `bus.actions = { run }` for a custom runner; `bound` is optional).
2. `createCommand(type, fn, scope)` → `createAction(type, fn, scope)`; `createCommand<P, R>(type)` → `createAction<Call<P, R>>(type)`; `createAction(type, prepare)` → `createAction(type, { prepare })`.
3. Release as the next minor with `### Breaking` and `### Added` in `CHANGELOG.md`; no rollback path beyond not upgrading.

## Open Questions

- The return of `createAction(...)` must be kept to get the inferred result: `const getId = createAction("user/getId", handler)` then `bus.emit(getId())`. A call whose value is dropped cannot type a later string `emit`; that case uses the hint or `Call`.
