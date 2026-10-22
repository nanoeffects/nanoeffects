# Proposal

## Why

To type a store (or client, or logger) on every task, the user writes the field twice: as a value in `createBus({ context: { store } })` and as a type in the event map, `& WithContext<{ store: Store }>`. The type says what the value already says, and `docs/typescript.md` has a section around this boilerplate.

TypeScript cannot infer the fields inside `createBus`. When a caller writes `createBus<Events>(…)`, no other type parameter is inferred, so `context: { store }` stays untyped. A signature change to `createBus` would work only for a bus without an event map. A plugin does not have this limit: `bus.use(contextPlugin({ store }))` infers the fields from its own argument, whatever the bus is typed with. A prototype outside the repo type-checks with an explicit `Events = { "user/loaded": User }`, without events, and chained with `effectsPlugin`.

## What Changes

- `contextPlugin(fields)` puts `fields` on the context of every task of the bus, and returns the same bus typed `Bus<E & WithContext<F>>`, with `F` inferred from the value. `fields` may be a function of the task, like the `context` option.
- Several uses merge: each adds its fields, and the types intersect. They also merge with the `context` option of `createBus` and with `WithContext` in the event map.
- A field name that another source already has is a type error. At runtime the fields of the library win, and a field already on the context is not overwritten.
- `createBus`, its `context` option and `WithContext` are unchanged and stay supported.
- Docs: `docs/context.md`, `docs/stores.md` and `docs/typescript.md` show the plugin; `examples/typescript-context` uses `type Events = { "user/loaded": User }` and `contextPlugin({ store })`. CHANGELOG entry.

## Capabilities

### New Capabilities
- `bus-context-fields`: fields that `contextPlugin` puts on every task of a bus, their types, and how they merge with other sources.

### Modified Capabilities

## Non-goals

- Changing the signature or the size of `createBus`.
- Inferring the event map or the payload types of events.
- Removing the `context` option or `WithContext`.
- Giving a field a different value per bus after creation (it is set when a task is made).

## Impact

- A new file with the plugin and its export. Where it is exported from (the main entry or another one) is decided in the design from the measured size of each entry; `createBus` alone must not grow.
- `src/core` keeps its code: the plugin uses `Bus.addContext`, the slot that `effectsPlugin` uses.
- Tests: runtime (fields on handlers, child tasks, modules; merge; library fields win; a present field is kept), types (inference with and without `Events`, composition with `effectsPlugin` and `EventsOf`, name clash).
- Docs and examples above, `CHANGELOG.md`.
