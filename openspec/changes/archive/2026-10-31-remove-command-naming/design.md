## Context

See `proposal.md`. `merge-action-command` made `createAction` the one creator but kept the internals of `createCommand` under their old names, on purpose, to keep that change small. The word is now in: the exported types `Command` and `CommandCall` (`src/core/bus.ts`, re-exported by `src/index.ts`), the trace effect `"command"` (`EffectName` in `src/core/types.ts`, `traceRun(ctx, "command", …)` in `emit`), the message of `MissingHandlerError`, `src/actions/command.ts` and its helpers, the `commands` variable and comments in `module.ts` and `job.ts`, and about a dozen docs and examples.

## Goals / Non-Goals

**Goals:**
- No `Command` anywhere a user can see it: types, trace, error text, docs, examples, skill, `llms.txt`.
- No behavior change except the three visible names (two types, the effect, the message).
- `createBus` does not grow: names only.

**Non-Goals:**
- Aliases or a deprecation period. The package is 0.x and `merge-action-command` removed `createCommand` the same way.
- Renaming the directories of existing specs or archived changes.
- The `create-nanoeffects` CLI "command": a shell command, a different word.

## Decisions

### The types are `Handled` and `HandledCall`

`Call<P, R>` already exists in `src/core/action-creator.ts` and means "payload `P` and result `R` in an event map", so `CommandCall` cannot become `Call`. `Handled<P, R>` is "an action that carries a handler"; `HandledCall<P, R>` is the value that calling it returns, the brand `emit` recognises. *Alternatives:* `ActionWithHandler` (long, shows in every error message), `Runnable` (also true of a job's outcomes), keeping `Command` (the point of the change).

### The trace effect becomes `"action"`

The effect names say what ran: `retry`, `timeout`, `poll`, `emit`. A handler run is the run of an action. *Alternative:* `"handler"`, rejected because `Phase`s and loggers already speak of handlers for plain listeners, which keep the effect `"on"`/`"run"` as they are. The change is breaking for anything that matches the string; the CHANGELOG says so and `EffectName` makes it a compile error in TypeScript.

### Rename by the language service, not by regex

`AGENTS.md` asks for the TypeScript language service for mass renames. Use it for the symbols (`findRenameLocations`), `git mv` for files (`command.ts` becomes `handled.ts`; tests follow: `command.test.ts`, `command-registry.test.ts`, `command-trace.test.ts`), and edit prose by hand, because "command" in prose has other senses (the CLI of the starter, a shell command in a docs step).

### Docs: replace the word with the thing

"A command" becomes "an action with a handler" on first use in a page and "the action" later. The glossary in `docs/actions.md` drops the sentence "Older pages and the code also call it a command". Code comments in snippets (`// createAction — a command with a handler`) say "an action with a handler".

### A guard keeps it out

A test in `src/tests/exports.test.ts` (or next to it) reads the `.d.ts` of the packed or built entries and fails on a name that contains `Command`. It runs on `dist/` when it exists and on the source `index.ts` files otherwise, so `pnpm vitest run` works before a build.

## Risks / Trade-offs

- [A user matches `effect === "command"` in a logger] → `### Breaking` in the CHANGELOG with the new value; TypeScript users get a compile error.
- [Text of `MissingHandlerError` is matched by a test or a dashboard] → same note; the class name and `instanceof` are unchanged.
- [A regex rename hits the CLI "command"] → prose is edited by hand; `packages/create-nanoeffects` and `docs/starter.md` are listed as not to touch.
- [The old specs keep the word in directory names and in prose of requirements not touched by the deltas] → accepted; the deltas change the requirements whose observable contract changes, and the rest is editorial and done at archive.
- [`createBus` size] → names do not reach the bundle, but `traceRun(ctx, "action", …)` changes a string in the hot path: measure with rolldown and brotli before and after.

## Migration Plan

1. Types and the trace effect in `src/core`, then `src/actions`, then the rest of `src`, with the language service.
2. Rename files and tests; update `exports.test.ts` and `types.test.ts`.
3. Docs, examples, skill, `llms.txt`, `AGENTS.md`; add the guard.
4. CHANGELOG, then the full gate list of `AGENTS.md`. Rollback is `git revert`: no data or format changes.

## Open Questions

None that change the specs. The new file name `handled.ts` can be changed during apply without touching a spec.
