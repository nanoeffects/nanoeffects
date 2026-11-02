# Proposal

## Why

`graphLogger` builds the map of one run. One run never covers the app: a test, an e2e session and a manual session each see part of it. Feedback asked for two things that turn the map into a signal: join the graphs of several runs, and compare the graph with the listeners the bus has, to find a listener that never ran. Both are pure work over data the library already exports (`GraphSnapshot` and `describeBus`), so they need no change to the bus, the tracer or the logger.

## What Changes

- Add `mergeGraphs(...snapshots)` to `nanoeffects/trace`: joins `GraphSnapshot`s of different runs into one `GraphSnapshot` (counts add up, nodes and edges are the union, cycles are deduplicated).
- Add `findOrphans(described, snapshot)` to `nanoeffects/trace`: lists the listeners from `describeBus` that the graph never saw run, and says whether the event itself was never emitted.
- Add a docs recipe: build the graph from the test run on CI, write `toJSON()` to a file per run, merge the files, then look for orphans. English and `docs/ru`.
- No change to `createBus`, `createTracer`, `tracePlugin` or `graphLogger`. No `scripts/` command (that folder is not shipped).
- Not in this change: a filter by `traceGroupId` or module (wait for demand; `ExportOptions.group` already groups by name prefix), and recomputing cross-run cycles after a merge (see design).

## Capabilities

### New Capabilities

### Modified Capabilities
- `event-graph`: adds the requirements for joining snapshots and for finding listeners the graph never saw.

## Impact

- New files in `src/graph/` (`merge.ts`, `orphans.ts`, tests), re-exported from `src/graph/index.ts` and `src/trace/index.ts`.
- Two new names in the `nanoeffects/trace` entry; the `trace` size-limit in `package.json` is re-measured (tree-shaken: a user who imports neither pays nothing).
- `src/tests/exports.test.ts` and `surface.test.ts` list the new names.
- `docs/debugging-loops.md` (or `docs/tracing.md`) and `docs/ru/` get the recipe; `CHANGELOG.md` gets an `Added` entry under `Unreleased`.
