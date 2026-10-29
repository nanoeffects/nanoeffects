# Proposal

## Why

`reduxDevtools` sends the payload of an emit as it is in every action: the emit and each stage of a policy carry a copy. A list of 100 000 numbers is about 1 MB in each of three actions for one call (measured in `src/trace/redux-contract.test.ts`). The payload can also hold what must not reach a browser extension: tokens, passwords, personal data. The default should be quiet, like the rest of the logger, and the only way to stop it today is a logger of your own.

## What Changes

- New option `payload` on `reduxDevtools`: `"all"`, `"essential"` (the default) or `"none"`.
  - `"all"`: every action carries the payload of its event, as `reduxDevtools` did in 0.12.
  - `"essential"`: the payload goes with the emit actions, and with the stages that say a call was lost or failed (`cancel`, `drop`, `error`), where it is the only way to tell which call it was. The `start` and `done` stages, which repeat what the emit already showed, have none.
  - `"none"`: no action has a `payload` field.
- **BREAKING (observable output of `reduxDevtools`)**: with the default, the `start` and `done` actions of stages and effects lose their `payload`. `type`, `id`, `parentId`, `rootId`, `effect`, `phase`, `traceGroupId`, `error` and the state `{ running }` are as before. Use `payload: "all"` for the old output.
- Docs (`docs/tracing.md`, "Configure Redux DevTools"), `CHANGELOG.md` and the tests follow.

Out of scope: a function that trims or maps the payload, a size limit, linking a stage to its emit (it needs a change in `tracePlugin` and its contract; the emit event is a leaf, so a stage cannot name its emit).

## Capabilities

### New Capabilities

None.

### Modified Capabilities
- `redux-devtools-trace`: adds the option that chooses which actions carry the payload, and changes the default.

## Impact

- `src/trace/redux.ts` and its tests in `src/trace/loggers.test.ts` and `src/trace/redux-contract.test.ts`.
- `docs/tracing.md` ("Configure Redux DevTools"), `CHANGELOG.md` (`Unreleased`).
- No change in `src/core`, `tracePlugin`, the `Tracer` contract, or the other loggers.
