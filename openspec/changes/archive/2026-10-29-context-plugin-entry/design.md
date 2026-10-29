# Design

## Context

`src/index.ts` exports `createBus`, `anyEventType`, `commandCall` and `contextPlugin` as values. `contextPlugin` (`src/core/context-plugin.ts`, about 240 B minified) shares the file with the types `NoClash` and `ContextTask`, and `effectsPlugin` imports `NoClash` from it. Measured with esbuild on `dist/index.js`: `import { createBus }` gives 1297 B brotli, adding `contextPlugin` about 1399 B. `size-limit` measures the first, so its number does not change with this move.

The project's rule (`AGENTS.md`): anything optional goes to another entry, and the bus knows only the interfaces it needs. `scope`, `match`, `signal`, `oop`, `trace`, `react` already follow it; `contextPlugin` is the one plugin left in the main entry. The layers are also checked by `src/tests/architecture.test.ts`.

## Goals / Non-Goals

**Goals:**
- `dist/index.js` has no plugin code, for bundlers that tree-shake and for those that do not.
- The same layout as the other plugin entries, so a reader finds a plugin by its entry name.

**Non-Goals:**
- A change of what the plugin does, of its types, or of `createBus`.
- A smaller `createBus` number: it does not move.

## Decisions

**1. A new entry `nanoeffects/context`, folder `src/context/`.**
`plugin.ts` has `contextPlugin`; `index.ts` only re-exports (the repository rule). It imports only from `src/core`, so the layer rule holds, and `src/context/**` joins the `aboveCore` list of the architecture test. Entry name `context` matches the docs page `docs/context.md`, which already teaches the plugin.
*Alternative: put it in `nanoeffects/effects` (it has `effectsPlugin`).* Rejected: a project that wants fields on `ctx` should not pay for the effects.

**2. The two types stay in core.**
`NoClash<Fields, E>` and `ContextTask` move to `src/core/context-types.ts` (types only, no run-time code) and are exported from `nanoeffects` as before and re-exported from `nanoeffects/context`. `effectsPlugin` keeps importing `NoClash` from core. Types cost nothing at run time, and a code that names `NoClash` keeps compiling.
*Alternative: move the types too.* Rejected: `effectsPlugin` would import from `src/context`, a layer above the core, and the layers above it would depend on each other.

**3. No re-export of the function from `nanoeffects`.**
A bundler that does not tree-shake follows an `export … from` and still brings the code. A deprecated alias would also hide the move from users for a while. It is a **breaking** change, and the package is below 1.0 with a changelog that names the migration, as for `$effects` (0.7.0).
*Alternative: keep the alias for one release.* Rejected for the two reasons above; the migration is one line.

**4. Entry metadata, as for the other plugin entries.**
`package.json` `exports["./context"]` with `types` and `import` (no `notrace` condition: the plugin has no tracing code), `tsdown.config.ts` entry `context`, `tsconfig.json` path `nanoeffects/context`, and a `size-limit` line `context (plugin)` with a limit set from the measured size. The docs table of entries lists it. `src/tests/exports.test.ts` has the entry and its names.

**5. Version.**
`0.14.0`, with the migration line first in `### Breaking` of the changelog.

## Risks / Trade-offs

- [Every user of `contextPlugin` must change an import] → one line, named in the changelog and in the docs of the plugin; a wrong import is a type error, not a silent change.
- [Docs and examples import it from `nanoeffects`] → `pnpm docs:check` type-checks them against the sources, so a missed one fails the check.
- [A user who names the types from `nanoeffects`] → unchanged: the types stay there.
- [Another packed file in the package] → one more small file; the size limit line watches it.

## Migration Plan

Change `import { contextPlugin } from "nanoeffects"` to `import { contextPlugin } from "nanoeffects/context"`; leave `createBus` where it is. Release notes in `Unreleased`, release as `0.14.0`. Rollback is a revert of the move.
