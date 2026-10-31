## Context

`createBus` keeps every registration in `createStore()` (`src/core/store.ts`); `get(key)` already returns the tasks of a key as an array that is built once and not changed. Nothing outside `createBus` can read it. The owner needs a guarantee, in a test and in a dev tool, that a closed feature left no subscribers. `createBus` is 1299 B brotli against a limit of 1.3 kB, so any member costs bytes that the limit does not have.

Observed: `once` registers through the `on` that is closed over in `createBus`, not through `bus.on`, so a plugin that wraps `bus.on` does not see it; `matchPlugin` rides predicates on `"*"`; `devPlugin` counts a predicate under `"*"` itself. A count read from the store is right for all of them, a count kept by a plugin would not be.

## Goals / Non-Goals

**Goals:**
- Read how many listeners an event has, right now, from the real registrations.
- The smallest surface and the smallest cost in `createBus`.
- Work the same in any order of plugins.

**Non-Goals:**
- Reading or calling the listeners themselves.
- A total across all events (`listeners()` with no argument), a list of event names, or a change notification.
- Counting handlers bound in `bus.actions` (those are not subscriptions).

## Decisions

### A method of the bus that returns a number

`bus.listeners(event): number`, in `createBus`: `listeners: (event) => events.get(eventKey(event)).length`.

Alternatives, rejected:
- **Return the array of listeners.** It leaks the functions (a caller could call or compare them) and invites misuse. A number answers "is anything left" and costs the same bytes.
- **Expose the store as `bus.events`.** Gives `add`, `remove` and `clear` to everyone and fixes the internal shape as public contract.
- **A plugin (`inspectPlugin`) that counts.** It needs the store, so the core needs a slot anyway; wrapping `bus.on` misses `once`, which uses the closed-over `on`, and misses registrations made before the plugin is used. It would cost the same bytes in the core and still be wrong.

### `"*"` is a key of its own

`listeners("*")` counts the any-event listeners and `listeners("t")` does not include them: that is how the store keeps them, and it matches how `on("*")` is written. An emit runs the sum of the two; a caller who wants "who would hear `t`" adds them. A total is a non-goal until someone asks.

### Size

Before: `createBus` 1299 B brotli (limit 1.3 kB). The member is one property and one arrow over a call that exists already; the estimate is 25–40 B, so the entry fails at 1.3 kB. The measure goes in the tasks (rolldown bundle of `createBus` alone, brotli, and `pnpm size`). The limit moves to the first round value that fits (expected 1.35 kB) and the reason is written next to the numbers in the commit. If the cost is above 60 B, stop and look again before raising it; the member is the only thing that grows.

The `notrace` build does not change: it removes tracing code, and `listeners` has none.

### Tests that guard it

- `src/core` unit tests for the scenarios of the spec: `on`, twice the same function, the event shapes, `"*"`, `once` before and after it runs, `off(event)`, `off()`.
- `src/tests/plugin-matrix.test.ts`: a probe that registers one listener through each wrapper (`on`, `once`, a predicate of `matchPlugin`, a module `on`) and checks the counts, in every order of two and in 300 orders of all.
- Module `m.on` and `ctx.on`: the count is `0` after unmount or abort. If it is not, that is a bug of the test target and is reported, not worked around.
- `src/tests/types.test.ts`: `listeners` takes the same event shapes as `on`, a wrong event name is an error on a bus with an event map, the result is `number`.
- `src/tests/chat-widget-example.test.ts`: after the chat closes, `bus.listeners` of `chat/sent`, `chat/messageAdded` and `chat/typing` is `0`.

## Risks / Trade-offs

- **A hand-made `Bus` object has no `listeners`** → the member is required in the type, as `on` is; noted in the changelog. Real buses come from `createBus`.
- **A count tells "nothing is left", not "who"** → fine for the guarantee; a debugging tool that needs names is a later change.
- **`createBus` limit moves** → the measured byte cost and the reason are written down, and the rule of this repo (a change to `src/core` needs a measured reason) is met by the use case above.

## Open Questions

- The shape of a total (`listeners()` with no argument) if a dev tool wants "the bus is empty". Left out on purpose.
