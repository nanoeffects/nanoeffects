# Tasks

## 1. Core: brand and emit

- [x] 1.1 Add a `commandCall` symbol (and a small typed “command call” shape) in `src/core` next to `Command`, export what `createCommand` and `emit` need, and verify `pnpm tsgo` still passes for core
- [x] 1.2 Teach `emit` to run a branded `command(payload)` (same path as `emit(command, payload)`), skip `onUnhandled` for that form, add the return-type overload, and verify new bus unit tests cover result, listeners, plain action vs brand, and missing handler

## 2. Actions: createCommand / createJob

- [x] 2.1 Change `createCommand` so the call returns `{ type, payload }` branded with the command (no handler run), keep `match` / `type`, and verify command unit tests (including contract + registry) for `bus.emit(command(payload))`
- [x] 2.2 Confirm jobs inherit the behavior; update any job helper that still treats `command(payload)` as a run, and verify job unit tests for `bus.emit(loadUser(...))` and success/fail routing

## 3. Call sites, types, docs

- [x] 3.1 Move remaining `bus.emit(command, payload)` / direct `command(payload)` result uses in `src/`, `examples/`, and `src/tests/` to the new form where docs require it; keep the two-arg overload covered by at least one test; verify `pnpm vitest run` and `src/tests/types.test.ts` / guide test
- [x] 3.2 Update `README.md`, `docs/actions.md`, `docs/guide.md`, `AGENTS.md` if needed, and `CHANGELOG.md` (**BREAKING**), then verify `pnpm format && pnpm tsgo && pnpm check && pnpm vitest run && pnpm build`

## Workflow follow-up

- Archive the change after review (`/opsx:archive`).
