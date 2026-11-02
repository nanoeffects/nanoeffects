# Design

## Context

`tracePlugin` already wraps `bus.on` and `bus.once` and keeps one `Entry` per registration (`handler`, `wrapper`, `name`) in a registry per bus. A named listener is wrapped; a task is renamed through `renameTask(ctx, name)` which calls the optional `Tracer.rename(ref, type)`. The tracer builds `TraceEvent` and `TaskInfo` from its own ref. Nothing carries a location today, and a listener with no name is not wrapped, so it is not in the trace.

## Goals / Non-Goals

**Goals:**
- A `file:line:column` on the trace event, in `describeBus` and in the console logger, for listeners registered with the option on.
- No cost by default; one stack capture per registration when on; nothing on emit.

**Non-Goals:**
- Source maps, the source of an emit or of a policy-wrapped handler, a UI.

## Decisions

- **Opt-in option of the plugin, `tracePlugin({ source: true })`.** Capturing `new Error().stack` costs microseconds and a string per registration, which matters at 50 000 subscribers (the case the store is built for). Default off keeps the promise "pay nothing". Alternative: on whenever there is a tracer; rejected for that cost.
- **Capture in `src/trace/source.ts`, `sourceOf(skip)`.** It builds `new Error()`, reads `.stack` once, splits it into lines and returns the first frame outside the library. Which frames are the library's is decided in two steps, and never by a folder name:
  1. **A fixed count.** The frames of the capture and of the plugin's own wrapper are skipped by number. This is exact in every setup, also in a bundle where library and app code share a file.
  2. **The installed package, by its real root.** At load, `source.ts` reads its own `import.meta.url`. Only when that URL has `/node_modules/nanoeffects/` in it does it take the prefix up to and including that segment as the root of the package, and then skips every frame whose file starts with the root. This passes over wrappers in other chunks (a module's `m.on`, `extendBus`, `matchPlugin`). It compares absolute prefixes, so code of the user in some other folder named `nanoeffects/dist` is not skipped, and pnpm's `.pnpm/nanoeffects@x/node_modules/nanoeffects/` works the same.
  When the module is not under that segment (the repository's own `src`, a browser, an app bundle) step 2 is off and only step 1 applies. The location of a listener registered through a wrapper of the library is then the wrapper's, which the docs name; `traceId` is the answer. Alternatives: a pattern on `/nanoeffects/dist/` (wrong for a user's folder of that name, the case this replaces); a hidden option that each wrapper sets to add a frame to skip (every wrapper must clone the options, which they do not do today). `Error.captureStackTrace(target, fn)` stays an optimisation for V8 only if the tests show the plain way is slow.
- **One parser for the three formats.** A frame is matched by a trailing `(<url-or-path>:<line>:<column>)`, `at <url-or-path>:<line>:<column>`, or `@<url-or-path>:<line>:<column>`. The first line of a V8 stack (`Error`) is skipped by the same rule, as it has no location. Anything that does not match is ignored; no match gives `void 0`. `Error.stackTraceLimit` is read, not changed: when it is `0` there is no stack, which is the "missing stack" case.
- **Where it is stored.** `Entry` gets `source?: string`; the wrapper passes it to `renameTask(ctx, name, source)`; `renameTask` passes it to `tracer.rename?.(ref, type, source)`. `createTracer`'s ref gets `source`, and `report` and `announce` copy it when set, as they do for `traceGroupId`. The change in `src/core` is a type (`rename?(ref, type, source?)`) and one forwarded argument in a function that `createBus` does not import. Tasks: measure `createBus` before and after and stop if it moves.
- **Anonymous listeners are wrapped when the option is on.** Otherwise they would have no event to carry a source. The task keeps the event as its type: `rename` is called with the event key, which leaves `type` as it is and sets `event`. A listener on a predicate (no string key) stays unwrapped.
- **`consoleLogger({ source: true })` and `describeBus(bus, { source: true })` are opt-in as well**, because a line with a path is noisier than one without; the data is on the event for any logger that wants it.
- **Shape of `describeBus` does not change.** It stays an object of arrays of strings; the location is part of the string, so a snapshot test keeps working.

## Risks / Trade-offs

- A bundled or minified build reports the line of the bundle. The docs say to use source maps (`node --enable-source-maps`, or the browser's) and `traceId` where a stable name is needed.
- In a bundle or a browser build the second step is off, so a listener registered through a wrapper of the library (a module's `m.on`) shows the wrapper as its source. The docs name it.
- `Error.stack` is not standard. A runtime without it, or with `stackTraceLimit = 0`, gives no `source`; this is covered by a test.
- A new optional field on every event is visible to a logger that copies fields; it is set only when the option is on.
