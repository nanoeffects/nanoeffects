## Context

`graphLogger().toJSON()` gives a `GraphSnapshot` (`nodes` with counts, `edges` with counts and `inCycle`, `cycles`). `describeBus(bus)` gives `{ [event]: listenerNames[] }` where a name is the `traceId`, else the function name, else `"<anonymous>"`.

Checked in the code: `tracePlugin` renames the task of a named listener (`renameTask`, with the `traceId` or the function name) and `graphLogger` takes the node name from the task type. So a named listener is a node with the same name that `describeBus` prints, and a listener is a node only after it ran at least once. An anonymous listener has no node of its own. `describeBus(bus, { source: true })` appends ` (file:line:column)` to the name; `findOrphans` strips that suffix itself, so the reader has no rule to remember.

## Goals / Non-Goals

**Goals:**
- Two pure functions over data the library already exports, in the `nanoeffects/trace` entry.
- A CI recipe: graph from the test run, one JSON file per run, merge, orphans.

**Non-Goals:**
- A static graph from source code (costly, fragile, against "the surface does not grow").
- A filter by `traceGroupId` or module: `ExportOptions.group` covers names with a prefix; wait for demand.
- A command in `scripts/` or a CLI: `scripts/` is not shipped, and the user's CI already has a script.
- Recomputing cycles that close only after a merge (see below).

## Decisions

- **Functions of data, not methods of the logger.** `mergeGraphs` works on files read from earlier runs, where no logger exists. `findOrphans` takes the `describeBus` map, not the bus, so it works on a map saved to a file too. Alternative: `graph.merge(snapshot)` on the logger. Rejected: it grows the logger and needs a live instance.
- **Same entry, no new one.** Both go to `nanoeffects/trace` next to `graphLogger` and `describeBus`; an app that imports neither pays nothing (tree-shaken). Source in `src/graph/` (the data types live there), re-exported by `src/trace/index.ts`.
- **Orphan kinds.** `"unemitted"` (no node for the event) and `"unrun"` (event seen, listener not) are different bugs: dead code or missing scenario versus a policy or a condition that never lets the handler run. One list with a `kind`, not two functions.
- **Cycles in a merge are kept, not recomputed.** Cycles from the inputs are deduplicated by ring (the same key `graphLogger` uses). A cycle of `source: "graph"` that appears only because edges of two runs close it is not found by the merge. Alternative: run `findComponents` on the merged edges. It would find them, but needs the component logic outside the logger and a decision on how to build the `Finding`. Left for demand; `inCycle` is OR-ed so known cycles stay marked.
- **`site` and `last`.** First `site` wins (the code does not move between runs of one build); last `last` wins (the newest payload is the most useful).
- **Input is trusted data.** No schema check of a file read from disk; a wrong shape is the caller's error (same as any `JSON.parse`). Documented in the recipe.

## Risks / Trade-offs

- [Duplicate names: two listeners with one name are one node] -> a false "ran" for the second. Documented; use distinct `traceId`.
- [Few runs give false orphans] -> the docs say an orphan is a signal to read, not a failure to enforce, until the coverage is wide.
- [A renamed listener changes the node name between merged runs] -> the old name shows as an orphan or a lone node. Documented as a reason to merge runs of one build.
- [The `trace` size-limit] -> measured after the change; the two functions are small.
