# Proposal

## Why

`{ signal: AbortSignal }` is the most repeated type in code that uses nanoeffects: every function that takes the `signal` of a task, every fake or real API client, and every effect with a required context writes it by hand. The library already has the type under another name, `Signaled`, but it lives in `src/core/effect-types.ts` and is exported only from `nanoeffects/scope`, so almost nobody sees it. The root entry has `WithContext`, `WithPayload` and `WithType`, and the missing name of the family is `WithSignal`.

## What Changes

- A type `WithSignal = { signal: AbortSignal }` is exported from `nanoeffects`, next to `WithType`. It is a type only: nothing is added to the bundle, and `createBus` does not change in size.
- `Signaled` stays exported from `nanoeffects/scope` as an alias of `WithSignal`, so no import breaks.
- The library uses `WithSignal` where a signature requires a signal: `poll`, `cancellable`, the effects of a scope. The optional form `{ signal?: AbortSignal }` of `retry`, `all`, `race`, `timeout` and the other effects is a different type and does not change.
- The examples, the documentation and the starter templates use it where they wrote `{ signal: AbortSignal }` by hand (`api.ts` of every TypeScript template, the examples, the chat). The docs and the TypeScript page say in one short paragraph what it is.
- `CHANGELOG.md` under `Unreleased` (`### Added`).

Out of scope: a type for the optional signal, a change to `EffectContext` (the `{ signal, abort }` that a starter gets: it has `signal`, so it already fits `WithSignal`), and any change in behavior.

**The templates and the release.** The templates depend on the published `nanoeffects`, and `WithSignal` exists in it only from the next release. They are type-checked against `src` in this repository, so the check passes, but a project that is made before the release would not compile. The release that adds `WithSignal` must ship the templates that use it.

## Capabilities

### New Capabilities

### Modified Capabilities
- `root-entry`: the root entry also exports `WithSignal`.

## Impact

- `src/core` (the type and its export), `src/index.ts`, `src/core/effect-types.ts`, `src/scope/index.ts`, and the signatures in `src/effects/poll.ts`, `src/effects/cancellable.ts` and `src/scope/effect.ts`.
- `src/tests/types.test.ts` (what it accepts and rejects). No runtime code changes.
- `docs/typescript.md`, `docs/*.md` blocks that write `{ signal: AbortSignal }`, `examples/`, `examples/chat`, `packages/create-nanoeffects/templates/*-ts`, `CHANGELOG.md`.
