# Proposal

## Why

`contextPlugin` is exported from `nanoeffects`, the same entry as `createBus`. Few apps use it, and the project keeps everything optional out of the core entry: `scope`, `match`, `signal`, `oop` and `trace` are entries of their own. It is also the only plugin in the main entry, which is the odd one out.

`import { createBus }` already drops it in a bundler that tree-shakes (measured with esbuild: 1297 B brotli without it, about 1399 B with it), so the size of `createBus` does not change. What changes is the entry: `dist/index.js` carries no plugin code, a bundler that does not tree-shake does not carry it either, and the rule "the main entry is `createBus` and its types" holds without an exception.

## What Changes

- **BREAKING:** `contextPlugin` moves to the new entry `nanoeffects/context`. `import { contextPlugin } from "nanoeffects"` stops working. Migrate: `import { contextPlugin } from "nanoeffects/context"`; `createBus` and the other names stay where they are.
- The types `NoClash` and `ContextTask` stay exported from `nanoeffects` (types cost nothing at run time, and `effectsPlugin` uses `NoClash`) and are also exported from `nanoeffects/context`.
- `package.json` gets the export `./context`, `tsdown` the entry, `tsconfig` the path, and `size-limit` a line for the new entry.
- Docs, examples and the changelog follow; the version for the release is `0.14.0`.

Out of scope: a deprecated re-export from `nanoeffects` (it would keep the code reachable from the main entry), changing what `contextPlugin` does, moving `WithContext`, `EventsOf` or the `context` option of `createBus`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities
- `bus-context-fields`: `contextPlugin` is imported from `nanoeffects/context`, and "code written before keeps working" has this one exception.

## Impact

- `src/core/context-plugin.ts` is split: the plugin goes to `src/context/plugin.ts`, the two types stay in core. `src/index.ts` loses the runtime export; `src/effects/plugin.ts` imports `NoClash` from the types file.
- Tests that import `contextPlugin` (`src/core/context-plugin.test.ts` moves with it, `src/actions/module-start.test.ts`, `src/scope/plugin.test.ts`, `src/tests/plugin-matrix.test.ts`, `src/tests/types.test.ts`, `src/tests/exports.test.ts`).
- Docs and examples that import it: `docs/context.md`, `docs/typescript.md`, `docs/stores.md`, `docs/plugins.md`, `docs/scope.md`, `docs/oop.md`, `docs/package.md` (the entries table), `examples/typescript-context/bus.ts`, `AGENTS.md` (layout), `CHANGELOG.md`.
- Users: every import of `contextPlugin` from `nanoeffects` must change.
