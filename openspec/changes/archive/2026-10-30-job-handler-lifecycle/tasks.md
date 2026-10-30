# Tasks

## 1. Fix

- [x] 1.1 In `src/actions/job.ts` read the mark of `handler` once and pass it as `managed` to `route` in `invoke`. Tests next to `job.test.ts`: `createJob(type, queue(fn))` sends `pending` at the start of each call, an aborted waiting call sends nothing, `latest` sends `cancel` for the replaced run, a custom policy and a plain handler still send `pending` at the call. Verify with `pnpm vitest run src/actions/job.test.ts`.
- [x] 1.2 The same through the five policies, with a handler bound by `commands.handle` and one given to `createJob`, giving the same outcomes. Verify with `pnpm vitest run src/policies`.

## 2. Docs and gates

- [x] 2.1 Remove the bullet about binding the handler from `docs/server.md`, check `docs/actions.md`, and add a line under `Unreleased` in `CHANGELOG.md`. Verify with `pnpm docs:check` and `pnpm llms:check`.
- [x] 2.2 Run `pnpm verify`; if `actions (all)` is over its limit, say by how much.
