# nanoeffects: guide for AI assistants and contributors (AGENTS.md)

A typed event bus where each handler is a task with a context (`AbortSignal`, `emit`, `on`, `run`), plus policies (`latest`, `debounce`, `throttle`, `queue`, ...), effects (`retry`, `timeout`, `poll`, `all`, `take`, ...), commands/actions/jobs, modules and tracing. `README.md` is the short entry and `docs/` the user documentation (every example in `examples/` is type-checked with the project through `tsconfig` paths); this file is what you need to change the code without breaking its decisions. The owner talks to you in Russian, in short requests: answer in Russian.

## Commands

```bash
pnpm tsgo          # type check (tsc 7, strict, exactOptionalPropertyTypes, noUncheckedIndexedAccess)
pnpm check         # biome check ./src, with the plugins from lint/
pnpm format        # biome check --write --unsafe ./src
pnpm vitest run    # all tests (fake timers where time matters)
pnpm build         # tsdown: dist/ and dist/notrace/, then scripts/notrace-types.mjs
pnpm test:integration  # the real Redux Toolkit, Zustand, MobX, Jotai, and Vite and webpack bundling the packed package (needs `pnpm build` first; it builds when dist is missing)
pnpm consumer-check  # a clean project installs the package from npm (or a tarball: pass a path), type-checks and runs the README example
pnpm smoke         # the built dist on a plain Node, no dev tools (CI runs it on Node 18, 20, 22, 24; the dev tools need Node 22+)
pnpm lint:package  # publint and attw on the packed package
pnpm size          # size-limit: bundle size of each entry (brotli), limits in package.json
pnpm verify        # all of the above in one go (what CI runs)
```

Run `pnpm format && pnpm tsgo && pnpm check && pnpm vitest run && pnpm build` before you say that something is done. `format` may rewrite `void` to `undefined` in types: keep the `biome-ignore` on `Absent<P>` in `src/actions/action.ts`.

Do not commit, push or stage unless the owner asks. The working tree is often large and uncommitted on purpose.

**Commits made by an assistant are the owner's commits.** When the owner asks for a commit, make it under the owner's git identity (`git config user.name` and `user.email` of the repository; never set another author or committer), and write the message as the owner would: Conventional Commits, as `commitlint.config.js` checks, in English. Do not add `Co-Authored-By`, `Generated with` or any other trailer that names the assistant, and do not mention an AI in the message or the description of a pull request. The same goes for tags and releases. This overrides the default attribution of the tool you run in; for Claude Code `.claude/settings.json` switches its attribution off (`attribution.commit` and `attribution.pr` are empty), and other tools are covered by this paragraph.

## Layout

```
src/index.ts            re-exports only (every index.ts only re-exports)
src/core/               bus, context (task contexts), event, store, types, tracer contract, flag, logger
src/effects/            retry, timeout, poll, take, all, allSettled, race, cancellable, group (withGroup/runTraced)
src/policies/           latest, leading, debounce, throttle, queue, keyed (byKey), latestWith (shared core)
src/actions/            createAction, createCommand(s), createJob, createModule, modulePlugin
src/store/redux/        createEffectsMiddleware: a bus and a Redux middleware that emits actions to it (no dependency on redux); `middleware.ts` is its inner part, not exported
src/observable.ts       createObserve: an event of the bus as a TC39 Observable (entry nanoeffects/observable, no notrace build)
src/dev/                devPlugin: leak warning and module messages; wraps bus.on and app.mount, no dev code in core or actions; `noop.ts` is the production build
src/trace/              createTracer + loggers (console, performance, recorder, redux devtools)
src/utils/              onAbort hub, linkedController, delay, setTimer/clearTimer, raceAbort, promise, report
src/tests/              tests that cross modules (flows, fuzz, scenarios, regressions.*) and test-helpers.ts
integration/            tests with the real libraries and bundlers (own vitest config: vitest.integration.config.ts)
docs/, examples/        user documentation; examples are type-checked with the project (tsconfig paths map `nanoeffects/*` to `src`)
lint/                   GritQL readability rules (see below); excluded from biome's formatter on purpose
scripts/                notrace-types.mjs (postbuild)
```

Unit tests sit next to the file they test (`x.ts`, `x.test.ts`).

## Decisions that are easy to undo by mistake

- **`createBus` stays tiny** (about 1.2 kB gzip). Anything optional goes to another entry: tracing machinery is in `nanoeffects/trace`, commands in `nanoeffects/actions`. The bus only knows two interfaces, `Tracer` and `Commands`. Measure before and after a change to `src/core`: bundle `createBus` with rolldown and gzip it.
- **A plugin is a function of the bus.** `bus.use(plugin)` is one line, `plugin(bus)`, and returns what the plugin returns; modules are `bus.use(modulePlugin(modules))`, and `nanoeffects/dev` is a plugin as well. The bus exposes `context`, `trace` and `commands` for them. There is no list of plugins, no order, no merging of results and no plugin option in `createBus` (`composeBus` was built and removed as too much): do not add them unless the owner asks.
- **`ctx` is the first argument of every effect** (`retry(ctx, fn, options)`), so `...rest` can follow later. Outside a task pass `{}` or anything with a `signal`.
- **`emit` is a plain synchronous loop.** The first handler error stops the rest and is thrown, unless `onError` is set; then handlers are isolated. Async rejections are not handled without `onError`.
- **An aborted task delivers no result.** Promises reject with the abort reason; `ctx.emit` and `ctx.on` do nothing after an abort. One shared `onAbort` hub per signal (one real listener each) keeps thousands of subscribers cheap.
- **Tracing is a contract, not a feature of the bus.** `Tracer` in `src/core/tracer.ts`; events `{ id, parent?, type, effect, phase, payload, error? }`; phases `start|done|error|cancel|drop`; sampling is per root task. The causal parent comes from `currentEmitter()`, which `ctx.emit` sets for the time of the synchronous emit.
- **`notrace` build.** `TRACE` in `src/core/flag.ts` reads `__NANOEFFECTS_TRACE__`; the second tsdown build defines it as `false`. `scripts/notrace-types.mjs` rewrites `trace?: Tracer;` of `BusOptions` to `never` in the `.d.ts` of that build, so it must keep matching that exact line in `src/core/bus.ts`. The package exports have the `notrace` condition for `.`, `effects`, `policies`, `actions`.
- **User fields in the context** are typed through the event map: `type Events = {...} & WithContext<{ store: Store }>` (a type-only symbol key in `src/core/bus.ts`, read by `ContextOf<E>`), filled with `createBus({ context })`, which can also be a function of the task (`ContextOption`); `createEffectsMiddleware` uses the function form to give each task a `store` that knows which task dispatches. `createTask` takes one object, `{ event, bus?, tracer?, parent? }`. Library fields win over them. There is no global interface any more.
- **Commands are attached to a bus that exists**: `createBus` has no `commands` option. `bus.use(commandsPlugin(bindings?))` makes the registry and sets `bus.commands`; `modulePlugin` does it when the bus has none; a custom runner is `bus.commands = { run }`. `emit` reads `bus.commands` each time. `m.use(...)` in a module brings sub-modules and commands that carry a handler (a command is bound to itself); `m.handle` gives an explicit handler. Do not bring the constructor option back.
- **Modules are known by name**: mounting a module whose name is taken unmounts the old one first (hot reload, see `docs/hmr.md`).
- **Dev diagnostics are a separate entry, `nanoeffects/dev`**, and are a no-op in production by the `production` export condition (a second build of `src/dev/noop.ts` in `dist/production/`), not by a flag. Core and actions carry no dev code: `devPlugin` (used as `bus.use(devPlugin({ app }))`) wraps `bus.on`, `app.mount` and `app.unmount` and `disconnect` restores them.
- **`onUnhandled`** is called for an event without listeners (not for commands).
- **Timers use `setTimer`/`clearTimer`** (`src/utils/timer.ts`), never `setTimeout` directly: waits over 2^31 - 1 ms are split, `Infinity` holds no timer, negative or `NaN` is 0.
- **Options that are `null`** (plain JavaScript callers) fall back to defaults: read options with `??`, not with destructuring defaults.
- **`throttle` and `debounce` follow lodash** (and patronum): verified by `src/policies/lodash-parity.test.ts` with random call sequences against the real lodash (a devDependency). `throttle` has a re-entrancy guard (`busy`) so a call made from inside `fn` waits; the leading-only modes use no timers.
- **`store.remove(key, task)` removes one registration** of a task that was added twice. The store keeps a `Map` of task to count (in the order of the first add), so adding and removing cost the same at 50 000 subscribers; `get` builds the array once and hands out that same array until the next change, so an emit that still walks it is not disturbed. A task added twice is listed twice next to its first place, and one that was removed and added again goes to the end.
- **Queue:** the slot is freed before the caller is resolved; aborting a running call resolves it with `undefined` at once; a waiting call that is already aborted when its turn comes is skipped.
- **Commands:** the bus runs `options.commands?.run ?? callCommand`. A handler bound in the registry wins over the command's own. A missing handler throws `MissingHandlerError` synchronously, also for jobs.

## Changes with OpenSpec

Larger changes are planned with OpenSpec (`openspec/`): `/opsx:propose "idea"` makes a change with `proposal.md`, a spec delta, `design.md` and `tasks.md` under `openspec/changes/<name>/`; planning stops there, and the owner starts `/opsx:apply` when the plan is accepted; `/opsx:archive` moves the delta into `openspec/specs/`. `openspec/config.yaml` holds the project context for the artifacts. `.claude/` and `.agents/` hold the generated commands and skills (`openspec update` refreshes them). Small fixes need no change.

## Code rules

- **Readability lint (`lint/*.grit`, for `src` and `examples`, not tests)**: no `as unknown as`, no casts inside call arguments, no two `?.` in one `const`/`let`/`return`, no ternary inside `??`, `||`, `&&`, and no arrow that calls a function with a callback that also calls one (`() => timeout(ctx, 5000, ({ signal }) => api.search(q, { signal }))`: too many operations on a line). Name the inner function or the step, or write a helper instead. The rule is about the shape, so keep the same care in docs and tests. Biome also limits cognitive complexity to 15 and forbids nested ternaries.
- **No `undefined` identifier** (`noRestrictedGlobals`): use `void 0`, `typeof x === "number"` and the like.
- **`index.ts` files contain only re-exports.**
- **Few extra types**, but add one where a signature gets hard to read (`Binding`, `Emittable`, `ModuleApi`). Do not make the code general ("implement" is too wide a name; name things by what they do).
- **Comments** say why, not what; match the density of the file you edit. Keep doc comments on public API with an `@example`.
- **Tests: no abbreviations.** Use `harness`, `handler`, `value`, `gate`, `debounced`, `command`, `moduleContext`... not `h`, `fn`, `n`, `d`, `deb`, `cmd`, `m`. `ctx`, `bus`, `app`, `ms`, `id` are names of the API and stay. Pin generics in test helpers (`queue<number, TestEvents, void>`). For a payload that is `undefined` at runtime use `noPayload` from `src/tests/test-helpers.ts`.
- `createAction("x")` without generics returns a `FreeActionCreator`: it keeps the literal type, and the payload type comes from the event map (the overloads of `On` in `src/core/bus.ts` put it before `ActionCreator<P>` and commands; keep that order). `createAction<Payload>("x")` gives the payload type instead.
- `src/tests/types.test.ts` checks what users see from the type checker (inference of handlers, policies, effects, commands; wrong calls with `@ts-expect-error`). `pnpm tsgo` runs it. A `@ts-expect-error` must sit above the line where TypeScript reports the error, which for a failed overload is the first argument of `bus.on`, not the inner call.
- Tests use fake timers for anything with time; `createHarness()` gives a bus that records its trace and fresh task contexts (`harness.ctx()`).

## Releasing

npm publishing goes through GitHub Actions with npm trusted publishing (no token): the package settings on npmjs.com name this repository and the workflow `release.yml`. To release:

1. Write the notes under `## <version>` in `CHANGELOG.md`, and set the same `version` in `package.json` (`npm version <x> --no-git-tag-version`).
2. `pnpm verify` (what CI runs), commit.
3. Tag and push: `git tag v<version> && git push origin main v<version>`. The `Release` workflow checks that the tag, `package.json` and the changelog agree, runs `verify` and `smoke`, publishes with provenance, and creates the GitHub release from the changelog.
4. After the release, `pnpm consumer-check` installs `nanoeffects@latest` into a clean project, type-checks the README example and runs it. Do not publish from a laptop: provenance works only from Actions, and a published version cannot be replaced.

## Tooling notes

- `lefthook.yml`: pre-commit runs biome with `--write` and `stage_fixed`, and `tsgo`; the output is plain text with one line per error because the VS Code git dialog shows only the start of it. Lefthook stashes unstaged changes, so the hook checks the staged content: stage fixed files again if the hook complains about something you already fixed.
- `biome.json` `files.includes` has `!lint`: the Biome formatter would turn the `.grit` rules into unreadable one-liners.
- Mass renames in tests were done with the TypeScript language service (`findRenameLocations`), not with regular expressions: do the same for large renames.
- Bundle size check: `dist/index.js` with its chunks, and a rolldown bundle of `createBus` alone.

## Where things stand

Done: bus with task contexts; policies with `key`; effects; commands, actions, jobs, modules; `context` option; tracing with loggers and the `notrace` build; about 1100 tests (lodash parity, fuzz, regressions from issues of other libraries).

Done: the Redux adapters. Zustand and MobX have no adapter on purpose (`bindSource` was built and removed as too much; the README shows the plain recipe). Ideas the owner has talked about and not started: splitting `src/tests/regressions.flow.test.ts` by topic; a `sample: 0` fast path in the tracer. The owner said that "complicating can be done later": prefer the simple version first.
