# Design

## Context

A policy is a `Task`, `(payload, ctx) => result`, and reads from `ctx` only `signal` (plus `abort`, `run` for the child it forks). `forkTask(parent)` already accepts any `{ signal }` as parent, and `createTask` builds a full context without a bus (`emit` and `on` forward to nothing). So a policy runs outside a bus today if the caller supplies a context; a test showed `debounce(100, fn)(1, { signal })` works. What is missing is the context supply, cancellation and types. See proposal.md for motivation.

## Goals / Non-Goals

**Goals:**
- One wrapper, one generic, that works for every policy and any custom `Task`.
- No change to `src/core`; no growth of `createBus`.
- Tree-shakable, JS-first docs.

**Non-Goals:**
- No `policy.*` namespace or entry with ready-made copies of each policy (it would defeat tree shaking or need hand-written overloads; may come later as sugar over `withPolicy`).
- No tracing of calls made through `withPolicy` (no tracer is available).
- No `emit` / `on` (nothing to forward to).

## Decisions

**`withPolicy(task)` wraps the result, not the factory.** `withPolicy(debounce(300, cb))` keeps `P` and `R` through one `Task<P, E, R>` parameter. Wrapping the factory (`withPolicy(debounce)`) would need a mapped type over its parameters, which TypeScript erases for generics (see AGENTS.md on scope effects). The cost is one more call at the use site, paid once.

**A context per call from `createTask`.** Each call makes a context with `createTask({ event: { type: "withPolicy", payload }, parent: { signal } })`, where `signal` is the current controller's. The context is unlinked when the returned promise settles. This reuses the context code instead of faking one, so `ctx.run`, `ctx.abort` and child links behave as on a bus. The alternative, passing `{ signal }` cast to `Context`, would crash a callback that calls `ctx.run`.

**One controller, replaced on `cancel`.** `cancel(reason)` aborts the controller and makes a new one, so later calls work. Policies check `ctx.signal.aborted` at entry and would otherwise stay dead after the first cancel. State kept by the policy (a throttle window, a queue) is not reset: aborting its tasks already clears timers and frees queue slots, as on a bus.

**Result shape.** The wrapper returns `Promise<Awaited<R> | undefined>`: a sync result is wrapped, a dropped call resolves `undefined`. The payload arguments use `PayloadOf<P>` (the same rest type as `ctx.run`), so a `void` payload is callable with no argument.

**Dispose.** `[Symbol.dispose]` is set only when `Symbol.dispose` exists (Node 18 lacks it, and a missing symbol would become the key `"undefined"`); `src/oop/extend.ts` does the same.

**Placement.** `src/policies/with-policy.ts`, re-exported from `src/policies/index.ts`; it imports `createTask` from `src/core/context` (allowed by the layering: policies already import core). It is not a policy, but it is used with them and the "policies (all)" entry is where a reader looks.

**`usePolicy(callback, make, deps = [])` for React.** The obvious form `usePolicy(debounce(300, cb))` is rejected: `debounce(300, cb)` runs on every render, so the hook can keep the first policy (it holds the `cb` of the first render, a stale closure) or swap it when `cb` changes (an inline `cb` changes every render, which cancels the pending debounce on each keystroke). Instead the hook separates the two:

- `callback` goes into a ref that is set on each render. The task given to `make` is a thin `(payload, ctx) => ref.current(payload, ctx)`, so the policy always calls the latest callback.
- `make(task)` is called once per `deps` (`useMemo`), then wrapped with `withPolicy`. The policy state lives as long as that function.
- An effect cleanup calls `cancel()` on that function: it runs on unmount and when `deps` change (the old function is cancelled before the new one is used). `cancel` replaces the controller, so a Strict Mode simulated unmount leaves the function usable.
- In development React may call the `useMemo` factory twice and drop one result; the dropped function made no calls, so it holds no timer.

The hook has no ready-made siblings: `useDebounce` and the like are sugar over it, can be added later, and are out of scope. It lives in `src/react/use-policy.ts` and the `nanoeffects/react` entry, which already treats `react` as an optional peer; `nanoeffects/policies` and the core stay free of React.

## Risks / Trade-offs

- [Callback uses `emit` / `on` and expects an effect] → they are no-ops by design; documented in the page and the spec.
- [Misuse with `queue`: `cancel` drops waiting calls and frees running slots] → documented in one sentence; same semantics as aborting a task on a bus.
- [Size growth of "policies (all)"] → measure with `pnpm size`; raise the limit only by the measured amount.
- [`deps` forgotten when `make` reads a prop, e.g. `(task) => debounce(wait, task)`] → the policy keeps the first `wait`; documented with the `deps` argument in the React page.
- [Name `withPolicy` vs a later ready-made entry] → the entry, if added, imports `withPolicy`, so the name stays.
