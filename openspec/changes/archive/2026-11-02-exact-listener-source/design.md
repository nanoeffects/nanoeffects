# Design

## Context

The archived change `add-listener-source` reads `new Error().stack` in `tracePlugin` and skips its own two frames, and, only when the module URL contains `/node_modules/nanoeffects/`, the frames under that package. Inspection of the code shows what stands between a user and `bus.on`:

| Front | File | Calls the method of the bus how | Notes |
| ----- | ---- | ------------------------------- | ----- |
| `matchPlugin` | `src/match/plugin.ts` | `onWith`, assigned by `Object.assign(bus, apiOf({ on, once, off }))` | wraps `on` and `once` |
| `signalPlugin` | `src/signal/plugin.ts` | `removedBy(on, false)` and `removedBy(once, true)` | wraps the methods it finds |
| `devPlugin` | `src/dev/plugin.ts` | `wrapped` replaces `bus.on` | has its own call-site capture for the leak warning, with a fixed count |
| hold of `modulePlugin` | `src/actions/hold.ts` | `subscribing(kind, method)` | **defers**: queues the call and replays it later |
| `m.on` of a module | `src/actions/module.ts` (`listenWith`) | `Reflect.apply(task.on, …)` → `ctx.on` (core) → `bus.on` | goes through `ctx.on` |
| `extendBus` | `src/oop/extend.ts` (`methodsOf`, `forwarding`) | `subscribe(instance, bus, kind, args)` → `bus.on` | several functions deep; `@On` decorators subscribe in the constructor |
| `ctx.on` by hand | `src/core/context.ts` (`taskOn`) | `bus.on` | part of the code of `createBus` |
| `tracePlugin` | `src/trace/plugin.ts` | itself | |

`scopePlugin`, `contextPlugin`, `actionsPlugin`, `emitterPlugin` and the `react`, `vue` and `svelte` plugins do not wrap `on`.

## Goals / Non-Goals

**Goals:**
- `source` is the line of the user's call, in any order of plugins, bundled or not.
- A cost only for the one who turned `source` on.
- A rule that a new wrapper can follow, and a test that fails when one forgets.

**Non-Goals:**
- `ctx.on` by hand, a change in `createBus`, unifying the capture of `devPlugin`, the source of an emit.

## Decisions

- **A slot, not a rule about files.** `src/utils/caller.ts` holds `wantCaller()` (called by `tracePlugin({ source: true })`), `withCaller(call, saved?)` and `takeCaller()`:
  - `withCaller` returns `call()` at once when nobody wanted a caller, or when the slot is taken. Otherwise it puts `saved ?? new Error().stack` in the slot, calls `call()` and resets the slot in a `finally`.
  - The stack it reads has the frames `withCaller`, the wrapper that called it, the user. The count is always two because the rule is that a wrapper calls `withCaller` directly in its own body, not through another helper.
  - `tracePlugin` takes `takeCaller()`; when the slot is empty, it reads a stack through the same helper (`withCaller(() => ...)` in its own wrapper), so its count is two as well. `sourceFrom(stack, 2)` takes the third frame.
  - Alternative: a path rule with more directories (`.vite/deps`); rejected, it is a list that grows and does not work in a bundle. Alternative: `Error.captureStackTrace(holder, bus.on)`; rejected, V8 only and misses `m.on` and `extendBus`. Alternative: a list of wrappers on the bus with `tracePlugin` first; rejected, it undoes "no list of plugins, no order" and misses the fronts that are not `bus.on`.
- **Where the helper lives.** In `src/utils`, which `src/core` already imports (`onAbort`, `linkedController`), so the architecture test is not touched. `createBus` does not import it, and this is measured.
- **The hold defers, so it saves.** `subscribing` in `hold.ts` calls `withCaller` once to read the stack at the user's call and keeps it in `Held` (`stack`); `replay` calls `withCaller(call, held.stack)`. With the option off `Held.stack` is `void 0` and nothing is read. Calls made after `release()` go straight through, with the user's frame on the stack as usual.
- **`m.on`.** `listenWith` calls `withCaller` around `Reflect.apply(taskOn, …)`, so the slot is taken above `ctx.on` and the module's `m.on` is covered without touching core.
- **`extendBus`.** The `on` and `once` arrows in `methodsOf` call `withCaller(() => subscribe(…))`; `forwarding` (used by `Emitter`) the same. The registration that `@On` and `@Once` make in the constructor is called from the constructor of the class, so its source is the line that made the instance; the test records that.
- **`ctx.on` by hand stays out.** It would need the helper inside the code of `createBus`, which is at 1296 of 1300 bytes. If a measurement shows room, it is a one-line follow-up; the spec leaves it as a limit.
- **Safe by `finally` and by being synchronous.** A wrapper that awaits before calling the method below it would lose the slot. The only deferring front is the hold, which saves the stack.
- **The rule and a test that enforces it.** `AGENTS.md` gets the sentence next to "pass the options on". The matrix runs every wrapper in every order and fails on a source that is not in the probe file; this brings back the strict probe that was loosened.
- **`source.ts` gets smaller.** The package root, `import.meta.url` and the `node_modules` segment go out; `framesOf` and `sourceFrom(stack, skip)` stay, the tests of the root rule go with it.

## Risks / Trade-offs

- A new wrapper that forgets `withCaller` shows itself as the source. The matrix catches the ones that are in it; a plugin of a user's own is on its own, and the docs say what to call.
- A global slot is shared by all buses. It is safe because it is held only during a synchronous call and is reset in a `finally`; a test covers a registration inside a handler that registers again.
- The cost with the option off is a check in each wrapper. With it on, one `Error` per registration, as before.
- `devPlugin` keeps its own capture, so there are two ways to find a call site in the code until they are unified.
