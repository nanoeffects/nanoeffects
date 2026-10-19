# Design

## Context

`createJob(type, handler, { done, fail })` makes a command with `createCommand` and wraps its handler (`wrap`) so that the outcome is sent on with `send(ctx, target, payload)`, where a target is a string, an action creator, a command or a plain action, and `fail` decides whether an error is handled. It returns the command alone. See proposal.md for the motivation.

## Goals / Non-Goals

**Goals:**
- Return the command and its two actions together, and make the actions from strings so that nothing has to be created beforehand.
- Keep the routing as it is: the outcome is sent through the context of the task, skipped after an abort.

**Non-Goals:**
- Changing how a command is run, traced or aborted, or the registry.
- Giving a job a way to let errors reject (a job that wants that is a command).

## Decisions

**1. The shape is `{ command, successAction, failAction }`.** The command is the old return value (`Command & { type }`); the actions are action creators. Alternative: make the returned command carry the actions as properties. Rejected: a command is a function with a `type`, and extra properties would blur it with action creators.

**2. Strings go through `createAction`.** For a string `T` the job makes `createAction<Awaited<R>, T>(T)` for success and `createAction<unknown, T>(T)` for fail, so the literal type and the payload type are known without the caller writing generics. A given action creator is returned as it is, so a creator the caller already uses elsewhere stays the same object.

**3. Defaults are made, not omitted.** An omitted option becomes the default type `${type}/success` or `${type}/fail` (template literal types keep the literal). With both always present the routing is one path, and the type of the result does not depend on what was passed. The cost: an error is always handled, so the promise of the command resolves with `undefined` instead of rejecting. A caller that wants the error to reject uses `createCommand`.

**4. Targets are strings and action creators.** The old `send` handled a string, an action creator, a command and a plain object; the commands and the objects are removed, so `send` is `ctx.emit(creator(payload))`: the job always has an action creator in hand, made or given. Alternative: keep the four forms. Rejected: the returned `successAction` could not be typed as an action creator when the target is a command.

**5. The option is `success`, not `done`.** It matches `successAction` and the default type `…/success`. The package is `0.1.x`; the rename moves every call site in this change.

**6. The typing of `createJob`.** Overloads on the option types: `success` and `fail` each a string (made) or an `ActionCreator`; the return type has `successAction` and `failAction` as `ActionCreator<Awaited<R>, T>` and `ActionCreator<unknown, T>` for made ones and the given type for given ones.

## Risks / Trade-offs

- [An error of a job can no longer reject] → documented in `docs/actions.md`; a command is the tool for a result that must reject.
- [Default types can collide with an action the app already has] → they are `<type>/success` and `<type>/fail` under the type of the job, which the app chose; a collision is a naming mistake the owner can see.
- [Breaking the shape of `createJob` and the option name] → all call sites move here; the package is young.

## Migration Plan

For users: `createJob(t, fn, { done: a, fail: b })` becomes `const { command } = createJob(t, fn, { success: a, fail: b })`; a job that passed a command or a plain action as the target switches to an action creator. In the repository the tests, `docs/actions.md`, `examples/modules.ts` and `CHANGELOG.md` move in this change.
