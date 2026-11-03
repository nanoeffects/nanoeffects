## Why

Binding a handler to an action has three spellings: `setHandler(action, fn)` in the list of `actionsPlugin([...])`, `actions.handle(action, fn)` and `actions.handle([setHandler(...)])`, plus the same list form on a module's `m.handle([...])`. They do one job, and a reader must learn all three (`docs/actions.md`, `docs/guide.md`). `actions.handle(action, fn)` already does everything the list does, returns an unbind, and is the form tests use.

An alternative, `action.setHandler(fn)` on the creator, was considered and rejected: a creator is shared by every bus in the process, so it would be global mutable state (leaks between tests, two buses share one handler) and would break the rule that creators are never bound to a bus.

## What Changes

- **BREAKING** Remove `setHandler` and the `Binding` type from `nanoeffects/actions`.
- **BREAKING** `actionsPlugin()` takes no argument: the `bindings` list is removed.
- **BREAKING** Remove the list overload `handle(bindings)` of the registry (`actions.handle`) and of the module context (`m.handle`). The forms `handle(action, fn)` and `handle(type, fn)` stay.
- Docs (en and ru), examples, `llms.txt` and the doc comments show `actions.handle(action, fn)` as the one way to bind a handler to an action.
- `CHANGELOG.md` gets a `### Breaking` entry that says how to migrate.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `command-registry`: `actionsPlugin` takes no bindings; "Initial bindings" scenario is replaced by binding with `actions.handle`; merging into an existing registry no longer binds a list.
- `command-action-call`: the list of places that accept an action no longer names `setHandler`; the "bound declared action" scenario uses `actions.handle`.
- `module-commands`: `m.handle(bindings)` is removed; `m.handle(command, fn)` stays.

## Impact

- Code: `src/actions/handled.ts`, `src/actions/module.ts`, `src/actions/index.ts`; the `exports` test and the tests that use `setHandler` (`handled`, `handled-registry`, `module`, `module-start`, `types`, `scope/places`).
- Docs: `docs/actions.md`, `docs/guide.md`, `docs/ru/actions.md`, `docs/ru/guide.md`, `examples/guide.ts`, `llms.txt` if it names it.
- Size: removing code only; `createBus` is untouched. The `actions` size-limit can only go down.
- Users of `setHandler` or `actionsPlugin([...])` must switch to `actions.handle`. Version bump is the owner's call (a pre-1.0 breaking change).
