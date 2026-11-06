# Design

## Context

A policy is `(fn) => task`, built through `keyed()` (`src/policies/keyed.ts`): `keyed(key, create)` makes one instance per key, each given an `onIdle` to call when it holds nothing so the key is forgotten, and marks the task with `reportsLifecycle`. Instances tell the job around them what happens to each call with `startCall`, `dropCall`, `doneCall` and `endCall` (`src/policies/lifecycle.ts`). The two-form signature (`fn` first, or options first and a wrapper back) is `formOf`, with the `Unkeyed` / `Keyed` option types, as in `queue.ts` and `throttle.ts`. Timers are `setTimer` / `clearTimer`, time is `Date.now()` (as in `throttle`, so fake timers move it). See proposal.md for why.

Every policy so far lets one call be the task of one run. `dedupe` and `batch` are the first where one run serves several calls, each with its own context and its own abort signal. That is the part of the design that needs a decision.

## Goals / Non-Goals

**Goals:**
- Four policies that look and behave like the five existing ones: same forms, same `key`, same lifecycle contract, no special case for `withPolicy` / `usePolicy`.
- Each one small. Policies are tree-shaken per export; the cost is paid only by apps that import them.
- No change to `createBus` or the main entry.

**Non-Goals:**
- A cache (`dedupe` forgets at once; no TTL, no stale data) and result caching in `distinct`.
- Per-caller results of `batch` (a DataLoader-style split of the returned array). The first version gives every caller the same value; an option can be added later without changing what is specified now.
- A cap on waiting calls in `rateLimit`, and a concurrency limit in it. A user combines `queue({ concurrency })` with `rateLimit` when both are needed.
- A new "shared run" helper in `core`. Both policies keep their own few lines in `src/policies/`.

## Decisions

### 1. `dedupe`: the default key is the payload

Every other policy without `key` has one state for all calls. For `dedupe` that would make `dedupe(getUser)` hand the result for user 1 to a caller who asked for user 2, which is wrong silently. So the key defaults to the payload (a `Map` key, `SameValueZero`): ids and other primitives work with no option, objects never match unless `key` says how. `key: () => "all"` gives the one-shared-state reading.

Alternatives: *no key means one state* (consistent, but the footgun above); *stable JSON of the payload* (hidden cost and hidden collisions).

### 2. `dedupe`: the run belongs to the first caller; on its abort it is handed on

`fn(payload, ctx)` needs one context. The first caller's is used. A derived context whose signal aborts only when all callers abort is not possible without the bus: `ctx.emit` and `ctx.on` are closures over the task's own signal, so a context copied with another signal would still go dead with the owner. So:

- a follower that aborts leaves the line and resolves with `undefined`;
- the owner that aborts while live followers wait: its run is aborted and `fn` starts again with the context of the first live follower (the run was cancelled either way; every waiting caller asked for the same payload);
- nobody live: nothing runs.

The restart can run `fn` twice for one logical request. That is acceptable for what `dedupe` is for (idempotent reads); the docs say to use `leading` or `queue` for writes.

Alternatives: *owner abort drops everyone* (simple, but in React an unmounted first component takes the data from the others, the case `dedupe` exists for); *refcounted signal on a private controller* (needs a context the policy cannot make, see above).

### 3. `batch` does not restart; the owner is the first live caller

A bulk call may have partly happened, so a restart is not safe. The context is the first caller's that is still live when the batch is sent; if that task aborts during the run the run is aborted and the others resolve with `undefined`. A caller that aborts while the batch collects is taken out of it (and the timer is cleared when the batch is empty); after the send it only stops waiting. The difference from `dedupe` is deliberate: `dedupe` is for reads that can be repeated, `batch` for sends that cannot.

### 4. Job lifecycle: one run, one `pending`, one outcome

A job counts runs, and a shared run is one run. The call that owns the run reports `startCall` and `doneCall`; calls that only wait for it report `dropCall` (the job sends nothing for them, their promise still resolves with the value). When the owner of a `dedupe` run changes after an abort, the first run is closed with `endCall` (cancelled) and the new owner reports a start. Trace shows the followers as phase `drop` of the new effect names.

### 5. `distinct`: remember the last payload of runs that did not fail

A strict "last call" rule would skip a retry of a failed save with the same draft. So a payload is remembered from the start of its run (a repeat while it runs is skipped) and forgotten when the run rejects or aborts. Skipped calls change nothing. The state of a key is the last payload, kept after the run, so it cannot be dropped on idle: `onIdle` is never called, the instance of a key stays. The docs say keys should come from a bounded set. A size cap (an LRU option) is not added: "complicating can be done later".

Equality is `Object.is`, with `equals(previous, next)` to replace it. Deep equality is not built in.

A skipped call returns `undefined`; an accepted call returns what `fn` returns, so a synchronous `fn` stays synchronous, as `leading` does.

### 6. `rateLimit`: waits by default, counts starts, one timer per key

For a quota the point is to delay calls, not lose them, so the default is `"wait"` in arrival order and `overflow: "drop"` is the other mode (named for the `overflow` option of `queue`; the `limit` and `maxSize`-like cap is left out, and `limit` here is the positional count so the option names do not clash). The state is a list of start times and a FIFO of waiting calls. One timer is armed for `starts[0] + ms`; when it fires the expired starts are dropped, waiting calls start while there is room, and the timer is armed again. When both lists are empty the key goes idle. A sliding window (not a fixed one) is what API quotas use and avoids a double burst at a window edge.

It limits starts only, and aborting a started run does not take its start out of the window (the request was sent). It always returns a promise, like `queue`, which it resembles (calls wait in order).

Invalid arguments: `limit < 1` or `NaN` is 1; `ms` follows `setTimer`.

Alternatives: *token bucket* (allows a burst and a steady rate, but two parameters and a harder explanation); *throttle with a count* (fixed window, the double-burst problem).

### 7. `batch`: fixed window from the first call, same value for every caller

The window opens at the first call and does not move (a debounce would never send under a steady stream). `maxSize` sends early. The handler gets `P[]` and the policy turns `Task<P[], E, R>` into `Task<P, E, Promise<Awaited<R> | undefined>>`. Every caller gets the batch's value or error. Splitting a returned array per caller is the common DataLoader need, but it needs an option and a result type that depends on it, so it is left out of this change; adding it later does not change a spec written here.

### 8. Where the code goes, and what else changes

- `src/policies/{dedupe,distinct,rate-limit,batch}.ts`, each with its test file; `src/policies/index.ts` re-exports them with their option types.
- `EffectName` in `src/core/types.ts` gets `"dedupe" | "distinct" | "rateLimit" | "batch"`: a union member is type-only and costs `createBus` nothing, but `src/tests/architecture.test.ts` and `types.test.ts` are run to be sure.
- `src/tests/plugin-matrix.test.ts` and `src/tests/exports.test.ts` list the new exports; `types.test.ts` gets inference and `@ts-expect-error` cases for the new signatures.
- `package.json` size-limit: measure `dist/policies.js` before and after, raise the `policies (all)` limit to the measured size plus a small margin; do not touch other entries.
- Docs: `docs/policies.md` table and entries, one recipe each in `docs/recipes.md` or `docs/policies.md` (dedupe: the same user asked for from three components; rateLimit: a quota; batch: analytics events; distinct: a repeated save), the Russian page, `docs/package.md`, `docs/plugins.md` if it lists policies, `llms.txt` description. JavaScript first, comments next to every library call, names local to a snippet. `CHANGELOG.md`: `Added`, under `Unreleased`.
- The "five policies" prose in the specs `with-policy`, `use-policy-hook` and `curried-policies` stays true (they are examples of behavior, and the new ones follow the same contract); the tests in this change prove it for `withPolicy`, `usePolicy` and the curried form.

## Risks / Trade-offs

- [`policies (all)` grows] → measure first; each policy is a separate export, so apps that do not use one do not pay for it. Keep each implementation below the size of `queue`.
- [`dedupe` can run `fn` twice after an owner abort] → documented; only for repeatable reads; tested with the abort scenarios.
- [`distinct` keeps one payload per key forever] → documented, keys should be bounded; an LRU option can come on demand.
- [Four policies without a demand signal, against AGENTS.md] → the owner chose it; keeping them small and independent makes any of them easy to remove before release.
- [Shared runs and the job counters] → one `pending` and one closing outcome per run is covered by lifecycle tests for each policy, with the plugin matrix checking order independence.
- [`batch` gives no per-caller results] → stated in docs; callers who need them can key their own results by payload inside `fn`.
- [Time-based tests] → every policy is tested with fake timers; the sliding window and abort cases get explicit scenarios (see tasks).

## Testing

The risk of these policies is in time, abort and composition, so they are tested more than the older ones (added at the owner's request, after the first implementation):

- unit tests per policy for every spec scenario;
- `policies-interaction.test.ts`: each of the newer policies around and inside the older ones, and around each other, with the result that each pair has to give;
- `src/testing/policies-new.test.ts`: marble diagrams, checked against the spec by hand before they were frozen;
- `policies-new.model.test.ts`: 800 random runs against a plain model (`distinct`, `rateLimit`, `batch`, `dedupe`) and heavy cases (50 000 keys, 10 000 waiting calls, 50 000 payloads in one batch);
- `policies-new.leaks.test.ts`: payloads and keys are collectable once a key is idle;
- `src/tests/policies-new.fuzz.test.ts`: 300 seeds of random mixes with random aborts, errors and handlers that ignore their signal, checking that every call settles, the trace stays consistent, windows and batch sizes hold, a job hears of each run once, and no timer is left; plus 1 200 seeds through `createJob` and `signalPlugin`;
- a probe of each policy in `plugin-matrix.test.ts` under every plugin order.

Each of these was checked by changing a policy on purpose (an off-by-one in the window, a missing handoff, a timer that is not cleared, a key that is never idle) and seeing a test fail. The fuzz run found two mistakes in its own model and none in the policies; the interaction tests found four wrong expectations of mine, which became the documented behavior of `leading`, `debounce`, `queue` and `rateLimit` around the newer policies.
