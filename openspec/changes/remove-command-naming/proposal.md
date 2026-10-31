## Why

`createCommand` is gone (change `merge-action-command`): there is one creator, `createAction`, and an action with a handler is what used to be a command. The word survived in the public types `Command` and `CommandCall`, in the trace effect `"command"`, in the text of `MissingHandlerError`, in internal names, and in many docs. A reader meets two names for one idea, which is the cost the merge was meant to remove.

## What Changes

- **BREAKING** The types `Command` and `CommandCall` of the root entry are renamed `Handled` and `HandledCall`. No aliases. (`Call` is taken: it is the result marker of an event map.)
- **BREAKING** The trace effect `"command"` is renamed `"action"` (`EffectName`, the events of every logger and recorder).
- **BREAKING** `MissingHandlerError` says `No handler for action "<type>"`.
- Internal names lose the word: `makeCommand`, `buildCommand`, `MadeCommand`, `ScopedCommand`, `makeCommandCall`, `commandOf`, `commandCall`, `callCommand`, the `commands` registry variable in `modulePlugin`; `command*.test.ts` and `src/actions/command.ts` are renamed.
- The word "command" (in the sense of an action with a handler) leaves docs, examples, `skills/nanoeffects/SKILL.md`, `llms.txt`, `AGENTS.md` and the glossary in `docs/actions.md`.
- A test fails when a public `.d.ts` of the package names `Command`.
- `CHANGELOG.md` gets a `### Breaking` note under Unreleased.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `command-action-call`: requirements that call an action with a handler "a command" say "an action with a handler"; the capability path stays.
- `command-registry`: the registry without a bus registry runs an action with a handler; the missing-handler message changes.
- `job-outcomes`: a job is an action with a handler; the missing-handler message changes.
- `root-entry`: the exported types are `Handled` and `HandledCall`; the internal key is not named `commandCall`.
- `trace-types`: the effect of a handler run is `"action"`.
- `public-surface`: a guard test keeps the old names out of the public `.d.ts`.

## Impact

- Code: `src/core/bus.ts`, `src/core/types.ts`, `src/index.ts`, `src/actions/*` (command.ts, module.ts, job.ts, action.ts), `src/scope`, `src/signal`, `src/trace`, tests, `scripts/bench-scope.mjs`.
- Users: type imports `Command`/`CommandCall` break; code or dashboards that match the trace effect `"command"` or the error text break.
- Docs: `docs/*.md`, `examples/`, `skills/`, `llms.txt`, `AGENTS.md`, `CHANGELOG.md`.
- Bundle: names only, so sizes should not change; measure `createBus` with rolldown/brotli before and after (limit 1.3 kB).
- Out of scope: the directory names of the existing specs (`command-*`, `module-commands`) and archived changes stay, as a capability is not moved. The `create-nanoeffects` "command" (a CLI) is a different thing and stays.
