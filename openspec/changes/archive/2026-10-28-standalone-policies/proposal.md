# Proposal

## Why

Policies (`debounce`, `throttle`, `latest`, `leading`, `queue`) are the most useful part of the library for a reader who has no bus: a debounced input handler, a throttled scroll callback, a "latest request wins" fetch. Today they return a `Task` that needs a context on every call, so `debounce(300, callback)(value)` does not type-check and a plain-JS caller must build `{ signal }` by hand, with no way to cancel a pending run. The first thing a level-A/B reader wants to try is `const onChange = debounce(...)`.

In React the plain function is not enough: a policy made in the body of a component is made again on every render, so its timer or window is lost, and made once it keeps the callback of the first render. A component needs one stable function that always calls its latest callback and is cancelled on unmount.

## What Changes

- Add `withPolicy(task)` to `nanoeffects/policies`: it takes a policy result (or any `Task`) and returns a plain function `(payload) => Promise` that needs no bus and no context argument.
- The returned function owns an `AbortController`. It has `.cancel()` (aborts pending and running calls; later calls work again) and `[Symbol.dispose]` (same as `cancel`, defined only where `Symbol.dispose` exists).
- The callback keeps the normal `(payload, ctx)` shape; `ctx` is a real task context without a bus (`signal`, `abort`, `run` work; `emit` and `on` do nothing), so a callback written for a bus works unchanged.
- Add `usePolicy(callback, make, deps?)` to `nanoeffects/react`: it returns a stable `withPolicy` function whose callback is the one of the latest render, makes the policy once with `make` (`(task) => debounce(300, task)`), makes it again when `deps` change, and cancels on unmount (also safe in Strict Mode).
- Document both: a section in `docs/policies.md` (JS example first), the `withPolicy` and `usePolicy` variants in the debounce and double-submit recipes, and links from the guide and the React page.
- Both are separate named exports, so a bundler drops them when unused. No namespace object, no new entry.

Out of scope (deferred): ready-made hooks (`useDebounce`, `useThrottle`, ...), a `policy.*` namespace, a separate entry with ready-made `debounce` / `throttle` names, tracing of calls made this way.

## Capabilities

### New Capabilities
- `with-policy`: calling a policy or any task as a plain function without a bus, with cancellation and disposal.
- `use-policy-hook`: a stable policy function in a React component, with the latest callback and cancellation on unmount.

### Modified Capabilities

## Impact

- New file `src/policies/with-policy.ts` (+ test), re-exported from `src/policies/index.ts`; it uses `createTask` from `src/core` (no change to core).
- New file `src/react/use-policy.ts` (+ test), re-exported from `src/react/index.ts`; it imports `withPolicy` and `react` (an optional peer dependency of that entry already).
- `docs/policies.md` (new section), `docs/debounce-and-abort.md`, `docs/prevent-double-submit.md`, `docs/guide.md`, `docs/react.md` (variants or links), `llms.txt` (policies and react lines), `CHANGELOG.md` (`Unreleased`).
- `package.json` `size-limit`: the "policies (all)" and "react" limits may need a small raise; measure.
- No breaking change; the bus and the existing policies are untouched.
