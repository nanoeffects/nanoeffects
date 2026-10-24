# Proposal: the reserved key of a scope is `$effects`

## Why

In a scope every key goes on `ctx` as it is, except `effects`, whose functions are bound to the task. `effects` is an everyday word: a user may want a context field with that name, and nothing in a scope says that this key is special. A `$` prefix marks the one reserved name and frees `effects` for ordinary use.

## What Changes

- **BREAKING:** the key that holds the bound functions of a scope is `$effects`, not `effects`. A scope written for nanoeffects 0.6.0, `{ api, effects: { race } }`, becomes `{ api, $effects: { race } }`.
- A key named `effects` is an ordinary field. A scope that still uses the old key puts that object on `ctx` unchanged and nothing is bound, with no error. Release notes say so, and the migration is one rename.
- Everything else stays: the key of a scope only. `effectsPlugin`, the types `Effects`, `Effect`, `SignalFirst`, the function `effect(fn)`, `docs/effects.md` keep their names.
- The merge that `createJob` does for its outcome action (`beneath`) merges `$effects` the same way as before.

## Non-goals

- Renaming `effectsPlugin`, `effect`, the types, or the pages.
- Accepting both keys for a while. The only users are those of 0.6.0, and a second spelling would keep the problem.
- A warning for the old key. A scope is ignored without the plugin on purpose, and a field named `effects` is allowed now, so the library cannot tell a mistake from a choice.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `scope-context`: the requirements that name the `effects` key of a scope in their text or scenarios (the flat object, the override in `emit`, any function with a signal first, generics of an effect, no leaks, the docs), and a scenario for a key named `effects`.

## Impact

- Code: `src/scope/plugin.ts`, `src/scope/types.ts`, `src/core/scope-types.ts`, `src/actions/carry.ts`, doc comments in `src/actions/*.ts`.
- Tests: `src/scope/*.test.ts`, `src/tests/types.test.ts`, `src/tests/scope-layers.test.ts`.
- Docs: `docs/scope.md`, `docs/actions.md`, `examples/scope.ts`, `CHANGELOG.md`, `AGENTS.md`.
- Release: nanoeffects 0.6.0 is published with the old key, so the next version is 0.7.0 (a breaking change at 0.x). The owner decides the number.
