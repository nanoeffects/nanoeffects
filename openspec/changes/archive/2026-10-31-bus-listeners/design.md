## Context

`createBus` keeps every registration in `createStore()` (`src/core/store.ts`); `get(key)` already returns the tasks of a key as an array that is built once and not changed until the key changes. Nothing outside `createBus` could read it. The owner needs a guarantee, in a test and in a dev tool, that a closed feature left no subscribers. `createBus` was 1299 B brotli against a limit of 1.3 kB, so any member costs bytes that the limit does not have; the owner asked to cut code rather than move the limit.

Observed: `once` registers through the `on` that is closed over in `createBus`, not through `bus.on`, so a plugin that wraps `bus.on` does not see it; `matchPlugin` rides predicates on `"*"`; `modulePlugin` holds `on`, `once` and `off` calls until the first use of the app. Reading the store sees all of them except the held ones, which `get` must therefore trigger.

## Goals / Non-Goals

**Goals:**
- Read the listeners of an event, right now, from the real registrations.
- The smallest surface and the smallest cost in `createBus`; the size limit stays.
- Work the same in any order of plugins.

**Non-Goals:**
- Counting for the caller (they use `.length`), a total across all events, a list of event names, a change notification.
- Reading by an action creator: the caller passes `creator.type`.
- Listing handlers bound in `bus.actions` (those are not subscriptions).

## Decisions

### `bus.get` is the store's `get`, passed through

`get: events.get` in the object that `createBus` returns, typed as `Store<E>["get"]`. The owner chose this over a method that returns a number: the array is richer, the owner counts with `.length`, and the code is one property. The array is the one the store already hands out and never changes afterwards, so a caller cannot disturb an emit that walks it.

Alternatives, rejected:
- **`bus.listeners(event): number`.** Built first; replaced on the owner's choice. It wrapped `get` in a function that also accepted creators and objects, 15–17 B more.
- **Expose the whole store as `bus.events`.** Gives `add`, `remove` and `clear` to everyone and makes the internal shape a public contract.
- **A plugin that counts.** It needs the store, so the core needs a slot anyway; wrapping `bus.on` misses `once` and registrations made before the plugin is used.

The entries are what the bus registered: a plugin or `once` may have wrapped the function, so the docs say to compare the length, not the functions.

### `"*"` is a key of its own

`get("*")` is the any-event listeners and `get("t")` does not include them: that is how the store keeps them. An emit runs the sum of the two.

### `modulePlugin` starts on `get`

`modulePlugin` holds `on`, `once` and `off` until the app starts, to keep the listeners of a module ahead of later ones. A `get` between a `bus.on` and the first emit would read an empty list. `get` is wrapped the same way as `bus.emit`: it starts the app, restores itself, and passes the call on. Found by the plugin matrix; a plugin that holds work must not let a read see the gap.

### `get()` with no name gives everything

The owner asked for an optional key. It costs 27–29 B in the store (`Object.keys(events).flatMap(get)` over the same function), paid for by the savings below. It returns the listeners of every event in the order of the events, the any-event ones included.

### Size

Before: `createBus` 1299 B brotli, limit 1.3 kB. With `get` as a property of the object: 1308 B; with an optional key: 1327 B. The owner does not want the limit to move, so the code was cut instead; each step was measured:
- the two `createTask({ event, bus, tracer, parent })` calls in `callHandler` and `emit` become one `taskOf(action)` (−4 B);
- the unsubscribe of the store's `add` is `() => remove(key, task)` (−2 B);
- the order of the properties of the bus object (brotli, −8 B);
- `eventKey` is `event.type ?? event` (a string has no `type`) instead of a `typeof` check (−9 B);
- the `onError` path tells a thenable inline (`typeof result?.then === "function"`) instead of importing `isPromise` (−22 B). Performance was a constraint: wrapping every result in `Promise.resolve` saved 34 B but allocated a promise per handler call when `onError` is set, so it was not kept. The only difference from `isPromise` is that a function with a `then` also counts as a thenable.
Result: 1296 B, limit untouched (4 B of headroom). The `notrace` build is unchanged.

`modulePlugin` costs the `actions` entry 23 B for the `get` wrapper (3285 → 3308 B; a shared wrapper for `emit` and `get` and a restoring one measured worse or no better). Its limit moves from 3.3 kB to 3.31 kB; the limit of `createBus` does not move.

## Risks / Trade-offs

- **The `actions` limit moves by 10 B** → measured above; `createBus` keeps its limit.
- **Performance of `emit` is kept**: no allocation was added to the hot path; the cost of `get` is in code size only.
- **The entries can be wrappers** → documented; use the length.
- **A hand-made `Bus` object has no `get`** → the member is required in the type, as `on` is; noted in the changelog.
- **`get` takes only a string** → no creator/object overloads, to stay small; `creator.type` is the documented way.

## Open Questions

- The shape of a total (`bus.get()` with no argument) if a dev tool wants "the bus is empty". Left out on purpose.
