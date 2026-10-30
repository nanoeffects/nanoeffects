# Design

## Context

`createJob` builds the command with `createCommand(type, handler)` and routes each call through `route(base, payload, ctx, managed)`. `managed` says that the handler is a library policy that reports when a call starts. For a handler bound afterwards, `job.wrap(base)` reads `Reflect.get(base, reportsLifecycle)`. When the bus runs the job's own handler, `invoke` calls `route(command, payload, ctx, false)`: `command` is the wrapper made by `createCommand`, which carries no mark, and the mark of `handler` is never read. See proposal.md for the symptom.

## Goals / Non-Goals

**Goals:**
- `createJob(type, policy(fn))` and `commands.handle(job, policy(fn))` give the same outcomes.

**Non-Goals:**
- No change for a handler that is not a library policy, and none for a registry handler.
- No change in `src/core`, in the policies, or in how `route` works.

## Decisions

- **Read the mark of `handler` once, in `createJob`**: `const managed = typeof handler === "function" && Reflect.get(handler, reportsLifecycle) === true`, and `invoke` passes it to `route` instead of `false`. The policy sets the mark on its task through `keyed()`, so every library policy is covered, and a custom policy is not.
- **No new code path in `route`.** It already handles `managed` for the bound handler, including `start`, `drop`, `cancel` and `done`.
- **Alternative: mark the command made by `createCommand`.** Rejected: it would put knowledge of lifecycles in `command.ts`, which does not know jobs.

## Risks / Trade-offs

- [`pending` moves later for existing code that gave a policy to `createJob`] → that is the documented lifecycle; the changelog says so.
- [A job whose handler is a policy and whose `pending` listener started the UI spinner at the call] → the spinner now starts when the call runs; for `queue` this is the correct moment.
- [Size] one extra read in `createJob`; measure `actions (all)` before and after.
