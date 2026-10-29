# Proposal

## Why

The root `nanoeffects` entry exports more than `createBus` and the types the bus needs. It carries the tracing types, which belong to `nanoeffects/trace` where the person who writes a logger looks for them, two internal keys of the plugins (`anyEventType`, `commandCall`) that no doc or example uses, and two context types (`ContextTask`, `NoClash`) that `nanoeffects/context` already exports. Nobody uses the library yet, so the clean-up costs nothing now and would break projects later.

## What Changes

- `nanoeffects/trace` exports the types `Tracer`, `Trace`, `TraceEvent`, `TraceLogger`, `Phase` and `EffectName`, as the same types the core defines, with no runtime code.
- **BREAKING:** the root entry no longer exports those six types. Import them from `nanoeffects/trace`.
- **BREAKING:** the root entry no longer exports the values `anyEventType` and `commandCall`. They are internal keys of the plugins; the code that needs them imports them from the core.
- **BREAKING:** the root entry no longer exports `ContextTask` and `NoClash`. They stay in `nanoeffects/context`, which reverses the choice of 0.14.0.
- The root entry keeps `createBus` and the types the bus needs to be written and used (`Bus`, `BusOptions`, the event and handler types, `Context`, `WithContext`, and the like).
- The custom logger example in `docs/tracing.md` imports `TraceLogger` from `nanoeffects/trace`; docs and examples that take a removed name from the root are fixed.
- `CHANGELOG.md` under `Unreleased` has a `### Breaking` section that says how to migrate. The version bump (a minor, `0.16.0`, in 0.x) belongs to the release step and is not part of this change.

## Capabilities

### New Capabilities
- `trace-types`: the types of tracing (the logger, the event, the phases and the tracer contract) are importable from `nanoeffects/trace`, and are the types the core defines.
- `root-entry`: the root entry exports `createBus` and the types the bus needs, and nothing of the plugins, the tracing machinery or the internal keys.

### Modified Capabilities
- `bus-context-fields`: `NoClash` and `ContextTask` are exported from `nanoeffects/context` only, no longer from both entries.

## Impact

- Code: `src/index.ts` (removed exports), `src/trace/index.ts` (type re-exports), `src/tests/exports.test.ts` (the runtime list of the root). Nothing in `src/core` changes; the definitions stay there.
- Public API: six types, two values and two types leave the root entry; six types are added to `nanoeffects/trace`. Breaking in 0.x.
- Size: the types are erased and the two values were unused by users, so the bundles do not grow; `dist/index.js` may shrink by a few bytes.
- Docs: `docs/tracing.md`, `AGENTS.md` (the line that says what the main entry has), and any page that names a removed export.
