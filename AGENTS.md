# nanoeffects: guide for AI assistants and contributors (AGENTS.md)

A typed event bus where each handler is a task with a context (`AbortSignal`, `emit`, `on`, `run`), plus policies (`latest`, `debounce`, `throttle`, `queue`, ...), effects (`retry`, `timeout`, `poll`, `all`, `take`, ...), commands/actions/jobs, modules and tracing. `README.md` is the user documentation; this file is what you need to change the code without breaking its decisions. The owner talks to you in Russian, in short requests: answer in Russian.

## Commands

```bash
pnpm tsgo          # type check (tsc 7, strict, exactOptionalPropertyTypes, noUncheckedIndexedAccess)
pnpm check         # biome check ./src, with the plugins from lint/
pnpm format        # biome check --write --unsafe ./src
pnpm vitest run    # all tests (fake timers where time matters)
pnpm build         # tsdown: dist/ and dist/notrace/, then scripts/notrace-types.mjs
```

Run `pnpm format && pnpm tsgo && pnpm check && pnpm vitest run && pnpm build` before you say that something is done. `format` may rewrite `void` to `undefined` in types: keep the `biome-ignore` on `Absent<P>` in `src/actions/action.ts`.

Do not commit, push or stage unless the owner asks. The working tree is often large and uncommitted on purpose.

## Layout

```
src/index.ts            re-exports only (every index.ts only re-exports)
src/core/               bus, context (task contexts), event, store, types, tracer contract, flag, logger
src/effects/            retry, timeout, poll, take, all, allSettled, race, cancellable, group (withGroup/runTraced)
src/policies/           latest, leading, debounce, throttle, queue, keyed (byKey), latestWith (shared core)
src/actions/            createAction, createCommand(s), createJob, createModule, registerModules
src/store/redux/        nanoeffectsMiddleware: Redux middleware that emits actions to the bus (no dependency on redux)
src/trace/              createTracer + loggers (console, performance, recorder, redux devtools)
src/utils/              onAbort hub, linkedController, delay, setTimer/clearTimer, raceAbort, promise, report
src/tests/              tests that cross modules (flows, fuzz, scenarios, regressions.*) and test-helpers.ts
lint/                   GritQL readability rules (see below); excluded from biome's formatter on purpose
scripts/                notrace-types.mjs (postbuild)
```

Unit tests sit next to the file they test (`x.ts`, `x.test.ts`).

## Decisions that are easy to undo by mistake

- **`createBus` stays tiny** (about 1.2 kB gzip). Anything optional goes to another entry: tracing machinery is in `nanoeffects/trace`, commands in `nanoeffects/actions`. The bus only knows two interfaces, `Tracer` and `Commands`. Measure before and after a change to `src/core`: bundle `createBus` with rolldown and gzip it.
- **No plugin system.** It was built (`plugins`, `composeBus`, `bus.use`) and removed as too much. Modules are `registerModules(bus, modules)`; the bus exposes `context`, `trace` and `commands` as read-only fields for it. Do not bring plugins back unless the owner asks.
- **`ctx` is the first argument of every effect** (`retry(ctx, fn, options)`), so `...rest` can follow later. Outside a task pass `{}` or anything with a `signal`.
- **`emit` is a plain synchronous loop.** The first handler error stops the rest and is thrown, unless `onError` is set; then handlers are isolated. Async rejections are not handled without `onError`.
- **An aborted task delivers no result.** Promises reject with the abort reason; `ctx.emit` and `ctx.on` do nothing after an abort. One shared `onAbort` hub per signal (one real listener each) keeps thousands of subscribers cheap.
- **Tracing is a contract, not a feature of the bus.** `Tracer` in `src/core/tracer.ts`; events `{ id, parent?, type, effect, phase, payload, error? }`; phases `start|done|error|cancel|drop`; sampling is per root task. The causal parent comes from `currentEmitter()`, which `ctx.emit` sets for the time of the synchronous emit.
- **`notrace` build.** `TRACE` in `src/core/flag.ts` reads `__NANOEFFECTS_TRACE__`; the second tsdown build defines it as `false`. `scripts/notrace-types.mjs` rewrites `trace?: Tracer;` of `BusOptions` to `never` in the `.d.ts` of that build, so it must keep matching that exact line in `src/core/bus.ts`. The package exports have the `notrace` condition for `.`, `effects`, `policies`, `actions`.
- **User fields in the context** can be a function of the task (`ContextOption`); `createEffectsMiddleware` uses that to give each task a `store` that knows which task dispatches. They are a global interface, `NanoeffectsContext` (declared in `src/core/bus.ts`), filled with `createBus({ context })`. Library fields win over them. `src/tests/context-option.test.ts` augments it with `store`, which applies to the whole type check.
- **Timers use `setTimer`/`clearTimer`** (`src/utils/timer.ts`), never `setTimeout` directly: waits over 2^31 - 1 ms are split, `Infinity` holds no timer, negative or `NaN` is 0.
- **Options that are `null`** (plain JavaScript callers) fall back to defaults: read options with `??`, not with destructuring defaults.
- **`throttle` and `debounce` follow lodash** (and patronum): verified by `src/policies/lodash-parity.test.ts` with random call sequences against the real lodash (a devDependency). `throttle` has a re-entrancy guard (`busy`) so a call made from inside `fn` waits; the leading-only modes use no timers.
- **`store.remove(key, task)` removes one registration** of a task that was added twice. Arrays handed out by `get` are copied on the next change (copy on write), which keeps 50 000 subscribers fast.
- **Queue:** the slot is freed before the caller is resolved; aborting a running call resolves it with `undefined` at once; a waiting call that is already aborted when its turn comes is skipped.
- **Commands:** the bus runs `options.commands?.run ?? callCommand`. A handler bound in the registry wins over the command's own. A missing handler throws `MissingHandlerError` synchronously, also for jobs.

## Code rules

- **Readability lint (`lint/*.grit`, only for non-test `src`)**: no `as unknown as`, no casts inside call arguments, no two `?.` in one `const`/`let`/`return`, no ternary inside `??`, `||`, `&&`. Name the step or write a helper instead. Biome also limits cognitive complexity to 15 and forbids nested ternaries.
- **No `undefined` identifier** (`noRestrictedGlobals`): use `void 0`, `typeof x === "number"` and the like.
- **`index.ts` files contain only re-exports.**
- **Few extra types**, but add one where a signature gets hard to read (`Binding`, `Emittable`, `ModuleApi`). Do not make the code general ("implement" is too wide a name; name things by what they do).
- **Comments** say why, not what; match the density of the file you edit. Keep doc comments on public API with an `@example`.
- **Tests: no abbreviations.** Use `harness`, `handler`, `value`, `gate`, `debounced`, `command`, `moduleContext`... not `h`, `fn`, `n`, `d`, `deb`, `cmd`, `m`. `ctx`, `bus`, `app`, `ms`, `id` are names of the API and stay. Pin generics in test helpers (`queue<number, TestEvents, void>`). For a payload that is `undefined` at runtime use `noPayload` from `src/tests/test-helpers.ts`.
- `src/tests/types.test.ts` checks what users see from the type checker (inference of handlers, policies, effects, commands; wrong calls with `@ts-expect-error`). `pnpm tsgo` runs it. A `@ts-expect-error` must sit above the line where TypeScript reports the error, which for a failed overload is the first argument of `bus.on`, not the inner call.
- Tests use fake timers for anything with time; `createHarness()` gives a bus that records its trace and fresh task contexts (`harness.ctx()`).

## Tooling notes

- `lefthook.yml`: pre-commit runs biome with `--write` and `stage_fixed`, and `tsgo`; the output is plain text with one line per error because the VS Code git dialog shows only the start of it. Lefthook stashes unstaged changes, so the hook checks the staged content: stage fixed files again if the hook complains about something you already fixed.
- `biome.json` `files.includes` has `!lint`: the Biome formatter would turn the `.grit` rules into unreadable one-liners.
- Mass renames in tests were done with the TypeScript language service (`findRenameLocations`), not with regular expressions: do the same for large renames.
- Bundle size check: `dist/index.js` with its chunks, and a rolldown bundle of `createBus` alone.

## Where things stand

Done: bus with task contexts; policies with `key`; effects; commands, actions, jobs, modules; `context` option; tracing with loggers and the `notrace` build; about 1100 tests (lodash parity, fuzz, regressions from issues of other libraries).

Done: the Redux adapters. Zustand and MobX have no adapter on purpose (`bindSource` was built and removed as too much; the README shows the plain recipe). Ideas the owner has talked about and not started: splitting `src/tests/regressions.flow.test.ts` by topic; a `createDomain` helper for type prefixes; a `sample: 0` fast path in the tracer. The owner said that "complicating can be done later": prefer the simple version first.
