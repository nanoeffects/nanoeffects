# Design

## Context

This change builds on `bus-use-plugins`: `bus.use(plugin)` and `modulePlugin`. `createBus` returns plain objects (`bus.on`, `bus.off`, `bus.emit`), and `registerModules` returns `app.mount`, `app.unmount`, `app.isMounted`, `app.dispose`. Mounting a module whose name is taken replaces the mounted one inside `registerModules`; it reports nothing. The package already has one way to cut code from a build: the `notrace` export condition with a second tsdown build. See proposal.md for the motivation.

## Goals / Non-Goals

**Goals:**
- The two diagnostics, connectable and disconnectable, without any change to `createBus` or `registerModules`.
- A production build that carries none of it and needs no guard in the user's code.

**Non-Goals:**
- Reporting sub-modules mounted with `m.use`: only what goes through `app.mount` and `app.unmount` is reported.
- A general dev mode of the library, a flag that other entries read, or a leak check by stack traces or by handler identity.
- Changing the `notrace` build.

## Decisions

**1. A separate entry with a plugin that wraps the objects it is given.** `devPlugin(options)` returns a plugin `(bus) => disconnect`, used as `bus.use(devPlugin({ app }))`; it replaces `bus.on` with a counting wrapper and, with `app`, `app.mount` and `app.unmount` with reporting wrappers; `disconnect()` puts the originals back. Core and actions get no dev code beyond the `use` line of `bus-use-plugins`, so `createBus` does not grow because of it and a bundle without the entry carries nothing. Alternative: dev hooks in `registerModules` and `bus`. Rejected: bytes in every build and a new flag to read.

**2. Leaks are counted by event, in the wrapper.** The wrapper counts listeners per event key (`eventKey`), adds one on `on`, and subtracts one when the unsubscribe function of that call runs (once). `bus.off(event, fn)` is not seen by the wrapper, so the count can be above the truth after `off`; the check says "more than `maxListeners` listeners were added and not unsubscribed" and the messages say so. Alternative: read the size of the store. Rejected: the store is not exposed, and adding a method costs core bytes. The warning fires once per excess and is re-armed when the count falls back to the limit.

**3. Module events come from wrapping `app.mount`.** The wrapper keeps the names of the modules it saw mounted and still mounted (`app.isMounted`). A mount of a name that is held by another mounted module is "replaced", otherwise "mounted"; `unmount` reports "unmounted". Alternative: have `registerModules` report. Rejected: see decision 1.

**4. Production is a no-op by export condition.** `exports["./dev"]` lists `production` first, pointing to a build of `src/dev/noop.ts` (`devPlugin` returns a plugin that does nothing and returns a function that does nothing, with the same signature), then `types`, then `import`. Vite and webpack set `production` in production builds, so no code or flag is needed in the app. Alternative: a `define` flag as for `notrace`. Rejected: it needs the user to set it and a flag in the code. Alternative: tell users to guard with `import.meta.env.DEV`. Not required; it still works and removes even the call.

**5. Defaults.** `maxListeners` 10 as in Node, `log` is `console.warn` for leaks and `console.info` for module messages, a message starts with `[nanoeffects]`. `leaks` and `modules` default to on.

## Risks / Trade-offs

- [The count can be above the truth after `bus.off(event, fn)`] → documented; `off` is rare next to the unsubscribe function that `on` returns.
- [A user who builds with a tool that sets no `production` condition gets the dev code] → it is only logging and wrappers; the docs name the guard as the fallback.
- [Wrapping `bus.on` could be seen as monkey-patching] → it is opt-in, restored by `disconnect`, and covered by a test that behavior is unchanged.
- [Sub-modules are not reported] → stated as a non-goal.

## Migration Plan

None: a new entry. Where the repository showed `import.meta.hot` code, `examples/hmr.ts` is deleted and `docs/hmr.md` rewritten.
