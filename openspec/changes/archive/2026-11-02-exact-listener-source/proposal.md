# Proposal

## Why

`tracePlugin({ source: true })` points a listener at the line of its `bus.on` call only when the call reaches the plugin directly. When another plugin wraps `on` (`matchPlugin`, `signalPlugin`, `devPlugin`), or the call goes through a module's `m.on`, an `extendBus` class or the replay of `modulePlugin`, the first frame after the plugin's own is the wrapper, not the code of the user. The path rule that was added to skip the library's files works only when the package is loaded from `node_modules/nanoeffects/`; in a bundle, and in Vite's dev server (`node_modules/.vite/deps`), it is off. Those are the common places to debug in.

## What Changes

- A caller slot replaces the path rule. A helper `withCaller(call, saved?)` reads `new Error().stack` once in the outermost wrapper of `on` or `once` and holds it for the synchronous time of the call; inner wrappers see it and do nothing; `tracePlugin` takes it, or reads the stack itself when it is the outermost. Both paths skip the same two frames, so the result does not depend on file names, order of plugins or bundling. It reads a stack only when `tracePlugin({ source: true })` asked for it.
- Every wrapper of `on` and `once` calls `withCaller`: `matchPlugin`, `signalPlugin`, `devPlugin`, the hold of `modulePlugin` (which defers the call: it saves the stack at the user's call and replays it), the `on` of a module (`m.on`) and the `on` and `once` of `extendBus`.
- `import.meta.url`, the package root and the `/node_modules/nanoeffects/` rule go out of `src/trace/source.ts`.
- `AGENTS.md` gets the rule: a method that wraps `on` or `once` calls `withCaller` directly in its body, next to the rule that it passes the options on.
- The probe of the plugin matrix is strict again: a listener registered through each wrapper, in every order of plugins, has a source in the file of the probe. Probes for `m.on`, `extendBus` and the held registration are added.
- Docs: the limit about wrappers in a bundle is dropped from `docs/tracing.md` and its Russian page; the limits about minified code, source maps and a missing stack stay. `CHANGELOG.md`, `### Fixed`.

Not in this change: `ctx.on` called by hand inside a handler (it lives in `src/core`, and `createBus` has no room for it; its source is the frame of `ctx.on`), unifying the call-site capture of `devPlugin`, and the source of an emit.

## Capabilities

### New Capabilities

None.

### Modified Capabilities
- `trace-source`: the location is the caller of the outermost wrapper, found by a slot; the rule about the package root is removed.

## Impact

- New `src/utils/caller.ts`; edits in `src/trace/source.ts` and `plugin.ts`, `src/match/plugin.ts`, `src/signal/plugin.ts`, `src/dev/plugin.ts`, `src/actions/hold.ts` and `module.ts`, `src/oop/extend.ts`; tests; `AGENTS.md`; `docs/tracing.md`, `docs/ru/tracing.md`; `CHANGELOG.md`.
- `createBus` does not import the helper and is measured before and after. The sizes of `match`, `signal`, `dev`, `actions`, `oop` and `trace` are measured.
- With the option off, each wrapper pays one boolean check and one call.
