# Proposal

## Why

Tracing is the strongest part of nanoeffects next to RxJS and Effector, but two gaps remain. A listener appears in the trace under its event type unless the author passes `traceId` by hand, so a log of a bus that nobody annotated is hard to read (Effector names units with a compiler plugin). And there is no way to see, before anything runs, who listens to what: `bus.get` lists listeners without their events, and a listener has no name. A near-static map answers "what happens if I emit this" without a trace.

## What Changes

- `tracePlugin` names a listener by its function name when no `traceId` is given. A function with no name (an arrow passed inline, or a function a policy returns) stays as it is. An explicit `traceId` wins.
- `describeBus(bus)` in `nanoeffects/trace`: returns `{ [event]: names[] }`, the listeners each event has right now, in the order they run. Names come from `traceId` or the function name. It reads a registry that `tracePlugin` keeps per bus, so `createBus` does not change.
- Docs: a page `docs/debugging-compared.md` (English and Russian) that compares tracing and debugging with RxJS, Effector and mitt, and shows the cases (who listens, which task began a chain, why a request stopped). It goes in the sidebar and in `llms.txt`.
- `CHANGELOG.md` under `Unreleased`.

Not in this change: a compiler plugin, a browser extension, replay of a recording, a static graph from source code.

## Capabilities

### New Capabilities
- `bus-listing`: `describeBus(bus)`, the map of events to listener names.
- `docs-debugging-comparison`: the docs page that compares debugging with RxJS, Effector and mitt.

### Modified Capabilities
- `trace-plugin`: a listener without `traceId` is named by its function name.

## Impact

- `src/trace/` (`plugin.ts`, a new `describe.ts`, `index.ts`), `docs/tracing.md` (the new naming and a link), `docs/debugging-compared.md` and `docs/ru/`, `tools/docs-site/sidebar.ts`, `llms.txt`, `CHANGELOG.md`.
- `createBus` does not change. `size-limit` of `trace` rises a little. The `notrace` build is unchanged: the plugin and `describeBus` do nothing without a tracer.
- Behavior seen by users: the `type` of the `run` task of an unannotated listener changes from the event type to the function name. A logger that matches on that type must be checked.
