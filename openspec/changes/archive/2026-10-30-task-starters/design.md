# Design

## Context

`retry(task, options)`, `timeout(ms, task)` and `poll(ms, task, options)` return a Task `(payload, ctx) => result`; the same effects with `ctx` first are the `ctx` forms (spec `effect-composition`). A group (`race`, `all`, `allSettled`, `timeout`) calls a starter with one argument, the context of the child task it made for it (spec `starter-context`). `delay` and `take` without `ctx` already return starters (spec `effect-starters`). See proposal.md for the motivation.

Today the Task branch of each effect is `(payload, ctx) => body(ctx, bodyOf(task, payload), …)`. A group calling it with one argument gives `ctx` undefined, and `withGroup` fails on it.

## Goals / Non-Goals

**Goals:**
- `retry(fn)`, `timeout(ms, fn)` and `poll(ms, fn)` are valid values in a group, next to `delay(ms)` and `take(event)`.
- Every call that works today keeps its result, its type and its trace.

**Non-Goals:**
- A new name, a wrapper function or a `starter(...)` adapter.
- A payload in starter mode: the wrapped function gets `undefined`.
- A change in `src/core`, in `createBus` or in the trace contract.

## Decisions

### 1. Starter mode is "one argument, and it is a context"

The returned function is `(first, second?) => …`. When `second === undefined` the call is a starter call and `first` is the child; otherwise it is the Task call. The bus (`bus.on`), `ctx.run`, `latest`, `queue` and the other policies, and `bodyOf` always pass the context as the second argument, so a Task call never has it missing. A payload that is itself a context, `retry(task)(ctx2, ctx)`, has two arguments and stays a Task call. Looking at the type of the first argument would not be safe (a payload may be an object with a `signal`); looking at `second` alone is.

*Alternatives:* (a) decide by `fn.length` — rejected as in `curried-starters` (optional parameters change it); (b) a separate name or wrapper — rejected by the owner: the same value must work in `bus.on` and in a group; (c) mark the starter call with a symbol on the child — rejected: the child is made by the library for any starter, and the Task would depend on a field of it.

### 2. A one-argument call that is not a context throws a clear `TypeError`

`retry(task)("payload")` by hand now has `second === undefined`, so it would be taken for a starter call with a string for a child. The shared check (a context is an object with a `signal`) throws before any timer, call or listener, with a message that names both calls. Today the same call fails deeper, in `withGroup`, with an error about `signal`; the new message is the better one. This is the only change on a path that fails today, so nothing that works is touched.

### 3. The wrapped function gets `(undefined, child)`

The Task is `(payload, ctx)`; in a group there is no payload, so it is `undefined`, and `ctx` is the child. The same child goes to `retryBody`, `timeoutBody` and `pollBody` as their context, exactly as `(child) => retry(child, fn)` would pass it; that is why the trace is the same by construction. A function that needs data from the handler closes over it: `retry((_, { signal }) => fetchUser(id, { signal }))`.

### 4. Types: an overloaded function, the Task overload last

The returned type is two call signatures: `(child: Context<E>) => R'` (the starter) and `(payload: P, ctx: Context<E>) => R'` (the Task), the Task one last, because TypeScript infers the parameters of a handler from the last signature, so `bus.on("x", retry(task))`, `latest(retry(task))` and `ctx.run(retry(task), payload)` infer as they do now (`types.test.ts` pins them). The starter signature is present only when `undefined extends P` or the child context fits `P`, through a conditional type. The second case is what the prototype showed: a function written as `(_, ctx) => …` inside a group has no argument to infer its payload from, so TypeScript takes the payload type from the starter that the group expects, which is the child. A `retry(loadUser)` with a `string` payload is not accepted as a starter. This is the riskiest part; the first task is a prototype of these types against the existing tests.

*Alternative:* a type intersection `Task<P, E, R> & Starter<R>`. Same inference concern; the prototype picks the one that keeps the existing tests green.

### 5. Trace and tracing of a forgotten context

No new trace code. The group of the effect (`retry`, `timeout`, `poll`) and its `run` children are made by the same bodies. A test through the recorder compares the starter form with the wrapper that forwards the child.

### 6. Performance and size

The Task branch gains one comparison (`second === void 0`) per call and one shared check on the starter path only. `effects (all)` is at 2.5 kB of 2.5 kB, so the limit is raised to what `pnpm size` shows plus a little margin (the number goes into the commit message and `package.json`). A microbenchmark of a Task call (`bus.on` with `retry(task)`) before and after is kept as a scratch script, not committed.

## Risks / Trade-offs

- [Overloads change the inference of Tasks] → the Task signature is last, `types.test.ts` pins `bus.on`, `latest`, `queue`, `ctx.run`; if the prototype cannot keep them, stop and change this design before coding the rest.
- [A hand call `task(payload)` changes its error] → decision 2; still an error, a clearer one.
- [A payload that is a context passed with one argument is taken as a child] → only by a hand call with one argument; the bus and `ctx.run` always pass two.
- [The wrapped function sees `undefined` as payload] → documented; closing over data is the way.
- [`effects` outgrows its limit again] → measured and raised once, with the number recorded.

## Migration Plan

None: additive, a minor release. Rollback is removing the check and the overload.

## Open Questions

None that change the specs. If the prototype of decision 4 cannot keep the existing inference, that is a design change, not a question for later.
