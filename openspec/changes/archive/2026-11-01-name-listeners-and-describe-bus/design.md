# Design

## Context

`tracePlugin` wraps `bus.on`, `bus.once` and `bus.off` only for a listener that has a `traceId`: it renames the task of the listener (`renameTask`) and keeps the wrapper in a `WeakMap` so `off` can find it. `bus.get` returns the stored tasks without their events, and a wrapper has no name. So a name is known only inside the plugin, and nothing lists the events. `createBus` is at its size limit and stays out of this.

## Goals / Non-Goals

**Goals:**
- Unannotated listeners show a useful name in every logger with no change in the app.
- `describeBus` answers "who listens to what" from the registry of the plugin.
- No change in `src/core`; `notrace` and a bus with no tracer are untouched.

**Non-Goals:**
- A compiler plugin, a static graph from source, replay, a UI.
- Naming handlers that a policy or another wrapper returns without a name.

## Decisions

- **Name fallback in the plugin.** In `subscribe`, `traceId` becomes `typeof given === "string" ? given : fn.name || void 0`. Empty means the existing early return, so an anonymous handler is not wrapped and costs nothing. Alternative: also read `fn.displayName`; rejected as one more convention.
- **A registry per bus.** `src/trace/listeners.ts` holds `WeakMap<Bus, Map<key, Entry[]>>` with `Entry = { handler, name }`. `remember` and `forget` already know the event key and the handler; they record there, and `once` removes its entry when it runs (it already calls `forget`). `bus.off(event)` and `bus.off()` clear the key or the map. The registry is written only when the plugin is active (tracer and `TRACE`), so `describeBus` is `{}` otherwise.
- **Unnamed listeners are listed too.** The plugin now sees every `on` call, so it records unnamed ones as `"<anonymous>"` without wrapping them. Alternative: list only named ones; rejected, it hides the thing the map is for.
- **Output shape is a plain object of arrays of strings**, easy to snapshot in a test and to print. Order follows registration, which is the order `emit` runs listeners.
- **Entry point.** `describeBus` is exported from `nanoeffects/trace`, the entry that already owns the plugin; no new entry. The `trace` limit in `size-limit` is re-measured.

## Risks / Trade-offs

- A logger or test that matches the `type` of a `run` task by the event type sees the function name now. Called out in the changelog (`### Changed`).
- `Function.name` can be mangled by a minifier, so production names can be short. The docs say to pass `traceId` where a stable name matters, and that the function names are for development.
- A policy-wrapped handler (`latest(fn)`) has no useful name. The docs show `traceId` for it. Revisit if a policy can carry the name of its function without a cost.
- Every `on` through the plugin now writes the registry: one `Map` write per subscribe, none per emit, so the hot path is unchanged.
