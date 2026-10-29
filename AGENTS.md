# nanoeffects: guide for AI assistants and contributors (AGENTS.md)

A typed event bus where each handler is a task with a context (`AbortSignal`, `emit`, `on`, `run`), plus policies (`latest`, `debounce`, `throttle`, `queue`, ...), effects (`retry`, `timeout`, `poll`, `all`, `take`, ...), commands/actions/jobs, modules and tracing. `README.md` is the short entry and `docs/` the user documentation (every example in `examples/` is type-checked with the project through `tsconfig` paths); how to write those pages is in [Documentation](#documentation). This file is what you need to change the code without breaking its decisions. The owner talks to you in Russian, in short requests: answer in Russian.

## Commands

```bash
pnpm tsgo          # type check (tsc 7, strict, exactOptionalPropertyTypes, noUncheckedIndexedAccess)
pnpm check         # biome check ./src ./examples ./integration ./scripts, with the plugins from lint/
pnpm format        # biome check --write --unsafe ./src
pnpm docs:check    # type-checks the js/ts code blocks of docs/*.md against src (scripts/docs-check.mjs)
pnpm llms:check    # llms.txt links every docs page once and names only real entries (scripts/llms-full.mjs; `pnpm build` writes llms-full.txt)
pnpm vitest run    # all tests (fake timers where time matters)
pnpm build         # tsdown: dist/ and dist/notrace/, then scripts/notrace-types.mjs
pnpm test:integration  # the real Redux Toolkit, Zustand, MobX, Jotai, and Vite and webpack bundling the packed package (needs `pnpm build` first; it builds when dist is missing); also the trace in a real Chromium: the DevTools playground and `integration/fixtures/trace` with `tracePlugin` and every logger, through `integration/browser-harness.ts` (needs a browser: `pnpm exec playwright-core install chromium`, or `CHROMIUM_PATH`; skipped without one locally, required on CI)
pnpm consumer-check  # a clean project installs the package from npm (or a tarball: pass a path), type-checks and runs the README example
pnpm smoke         # the built dist on a plain Node, no dev tools (CI runs it on Node 18, 20, 22, 24; the dev tools need Node 22+)
pnpm lint:package  # publint and attw on the packed package
pnpm size          # size-limit: bundle size of each entry (brotli), limits in package.json
pnpm verify        # all of the above in one go (what CI runs)
```

Run `pnpm format && pnpm tsgo && pnpm check && pnpm docs:check && pnpm llms:check && pnpm vitest run && pnpm build` before you say that something is done. `format` may rewrite `void` to `undefined` in types: keep the `biome-ignore` on `Absent<P>` in `src/actions/action.ts`.

Do not commit, push or stage unless the owner asks. The working tree is often large and uncommitted on purpose.

**Commits made by an assistant are the owner's commits.** When the owner asks for a commit, make it under the owner's git identity (`git config user.name` and `user.email` of the repository; never set another author or committer), and write the message as the owner would: Conventional Commits, as `commitlint.config.js` checks, in English. Do not add `Co-Authored-By`, `Generated with` or any other trailer that names the assistant, and do not mention an AI in the message or the description of a pull request. The same goes for tags and releases. This overrides the default attribution of the tool you run in; for Claude Code `.claude/settings.json` switches its attribution off (`attribution.commit` and `attribution.pr` are empty), and other tools are covered by this paragraph.

## Layout

```
src/index.ts            re-exports only (every index.ts only re-exports)
src/core/               bus, context (task contexts), event, store, types, action-creator types, tracer contract, flag, logger
src/effects/            retry, timeout, poll, take, all, allSettled, race, cancellable, group (withGroup/runTraced)
src/policies/           latest, leading, debounce, throttle, queue, keyed (byKey), latestWith (shared core)
src/actions/            createAction, createCommand(s), createJob, createModule, modulePlugin
src/context/           contextPlugin (entry nanoeffects/context); its types NoClash and ContextTask stay in src/core/context-types.ts
src/react/             reactPlugin (useEmitter, useEventState), usePolicy (entry nanoeffects/react, optional peer react, no notrace build)
src/vue/               vuePlugin (watchEmitter, useEventRef) (entry nanoeffects/vue, optional peer vue, no notrace build); the type of the state of an event is shared with react from src/core/state-of.ts
src/oop/               extendBus, Emitter, WithBus, On, Once, disposeBus: the methods of a bus on a class (entry nanoeffects/oop, own size-limit)
src/store/redux/        createEffectsMiddleware(bus, { filter }): the Redux middleware for a bus that already exists; it puts `ctx.store` on the tasks through `bus.addContext` (no dependency on redux); `middleware.ts` is its inner part, not exported
src/observable.ts       createObserve, Subject: an event of the bus as a TC39 Observable, and as a class with `next` (entry nanoeffects/observable, no notrace build)
src/dev/                devPlugin: leak warning and module messages; wraps bus.on and app.mount, no dev code in core or actions; `noop.ts` is the production build
src/trace/              createTracer + loggers (console, performance, recorder, redux devtools)
src/utils/              onAbort hub, linkedController, delay, setTimer/clearTimer, raceAbort, promise, report
packages/create-nanoeffects/  the npm package behind `npm create nanoeffects`: `index.js` (the CLI, no dependencies, no build), `templates/vanilla` and `templates/react` (JavaScript, Vite; biome ignores them), `index.test.js`
src/tests/              tests that cross modules (flows, fuzz, scenarios, regressions.*) and test-helpers.ts
integration/            tests with the real libraries and bundlers (own vitest config: vitest.integration.config.ts)
docs/, examples/        user documentation (see Documentation); examples are type-checked (tsconfig paths map `nanoeffects/*` to `src`)
lint/                   GritQL readability rules (see below); excluded from biome's formatter on purpose
llms.txt                index of docs/ for AI assistants (by hand); llms-full.txt is built from it, not committed
scripts/                notrace-types.mjs (postbuild), docs-check.mjs, llms-full.mjs
```

Unit tests sit next to the file they test (`x.ts`, `x.test.ts`).

## Documentation

Goal: the lowest practical onboarding cost for JavaScript developers. A reader should see what the library is for, install it, and apply it without studying internals. Frame docs by **project level** (what kind of app), not by package surface (every entry / every effect).

**Main principle:** help them start as soon as possible; only reveal the complexity their project level needs. Prefer dropping a section to adding “just in case” content. A full API list helps someone who already knows they need it — it does **not** help a beginner.

**Readability** (how fast a reader finds the answer and finishes the task). Orient to [Microsoft Writing Style Guide](https://learn.microsoft.com/en-us/style-guide/welcome/), [Google developer docs style](https://developers.google.com/style), and [Diátaxis](https://diataxis.fr/) (tutorials / how-to / reference / explanation — do not mix them in one section). Good docs are not “as short as possible”: as simple as the domain allows, detailed enough that the reader does not guess missing steps. Do not judge quality only by sentence length or an automated readability score.

1. **One paragraph, one idea.** Lead with the main point, then detail. Split mixed topics.
2. **Short sentences.** Prefer simple grammar; break stacked conditions into separate steps (~15–25 words is a useful target for instructions, not a hard cap).
3. **Lists and tables when they scan better.** Numbered = ordered steps; bullets = independent items; tables = compare options / errors / config. Do not list every sentence.
4. **Predictable headings.** Name the job (`Configure the Redux middleware`), not a vague noun (`Middleware`). Keep heading levels consecutive.
5. **Direct language.** Active voice and concrete verbs (`Run`, `Create`, `Configure`, `Verify`). Passive only when the actor is unknown or unimportant.
6. **Concrete examples.** Real commands / configs; say what to replace, prerequisites, and the expected result. Examples must match the described behavior.
7. **One term, one meaning.** Define a specialized word on first use; expand abbreviations the audience may not know. Do not rename the same thing for variety (`workspace` vs `project` if they differ in the product).
8. **Write for scanning.** Important facts first; call out warnings and limits; link related pages; never bury a critical condition at the end of a long paragraph. Descriptive link text (not “click here”).
9. **Must / should / can stay consistent.** `must` = required; `should` = recommended; `can` / `may` = allowed. Same words, same force, across pages.
10. **Instructions:** prerequisites before steps; warnings state the risk and how to avoid it; errors state cause, when they happen, and the fix. Drop duplicate prose, but keep a page usable on its own.

### README (strict)

The README is **only** levels **A → B**. Everything else is a link into `docs/`.

1. **Benefit** (what problem it solves) → **Install** → **minimal bus** (`on` / `emit` / unbind) → optionally **one** policy example (`latest` for overlapping async) → short **Docs** jump by *need* → a few value bullets.
2. **Do not put on the README:** package Entries tables, full `ctx` field tables, every emit shape, command/module tours, full effects lists, long Docs link rows, TypeScript event maps / `WithContext` / generics “to look complete”.
3. **One example = one job.** No second overlapping demo. No unrelated imports.
4. **JavaScript-shaped snippets** (no `Events` map unless the README’s job is typing — it is not). `examples/*.ts` may stay typed for `pnpm tsgo`; the README must still read as copy-paste JS.
5. Before adding a README block: *If a level-A reader removes it, can they still install and run the bus example?* If yes, it does not belong here — link to `docs/` instead.

### Project levels (ask “what project?”, not “what API?”)

| Level | Project shape | First need | Doc entry |
| ----- | ------------- | ---------- | --------- |
| **A** | Small app, widget, prototype; rare races | Small bus | README: bus only |
| **B** | SPA with async UI (search, submit, leave page) | Bus + policies | README → one `latest`; then `docs/policies.md` |
| **C** | Unreliable network / long flows | Selective effects | One effect per job; full list = reference |
| **D** | Domain logic off the UI | Commands / jobs / modules | `docs/actions.md` + modules example |
| **E** | Existing Redux / Zustand / MobX | Integration recipe | `docs/stores.md` |
| **F** | Long-lived platform needs | Trace, HMR, semantics, entry map | Reference only |

Policies are **B+**, not A. Level **D**: show examples without a UI framework when that is the point.

### Section gate (every page, including README)

1. Which project level is this page for?
2. Next step for that reader, or a **catalog** (entries, all effects, all `ctx` fields, full Docs dump)?
3. If we remove it, can A/B still succeed? If yes → reference link, not this page.

### JavaScript first; TypeScript only when it pays off

- **Default: JS.** Show a working plain-JS (or untyped) example first. Add a TypeScript variant only when it is **strictly necessary** — the point of the page is typing, or the reader cannot safely adapt the recipe without the checker.
- **Never teach with types up front.** Do not open a section or example with `type Events = … & WithContext<…>`; that looks like required app-wide setup. Put types in a trailing “Typing (optional)” block, or omit them.
- **If a type appears, explain it next to it.** Every `type` / utility (`WithContext`, `Events`, `RootState`, generics) gets a short **what it is** and **why it is here** (usually: “checker only; runtime already does X”). Unexplained type blocks are not allowed.
- Types **never** wire runtime behavior. `WithContext` and event maps do not connect a store “across the app”; middleware / `context: { store }` do.
- **`examples/*.ts`:** the file may stay `.ts` for `pnpm tsgo`, but the **recipe the reader copies** must match the JS docs path. Quarantine checker-only types in a labeled block with those what/why comments; point at the JS snippet in `docs/` as the primary copy-paste.
- **Redux recipes:** show RTK (`createSlice` / `createAction` from `@reduxjs/toolkit`) for actions. Do not invent a parallel action layer with `nanoeffects/actions` in store docs — the library’s job there is the middleware and policies.

### New API / new concept

Do not drop a block of unfamiliar calls (`m.on` + `m.handle` + `m.use`, …) without a story. Order: (1) **problem** without it, (2) **when** to use it, (3) **what this call does** and why this shape, (4) code. Prefer one **real case** (feature / screen / domain) over a tour of names. Several methods in one snippet → label each line or introduce one at a time. Method catalogs belong in reference.

### Guide and `docs/`

- Guide = ladder A → B → (C) → D; types late or optional.
- Reference pages: who/when in the first lines; one minimal example; then the catalog.
- Describe inputs, result, limits, side effects. Rare options after the base case.
- Everyday JS wording; explain a specialized term on first use. No duplication of README in `docs/` and vice versa.

### Code blocks in `docs/` are type-checked

`pnpm docs:check` checks every `js`, `jsx`, `ts` and `tsx` fence of `docs/*.md` on its own, with `nanoeffects/*` mapped to `src`. `js` blocks report only stale names (missing name, export, module, wrong argument count, unknown option), because a JavaScript reader gets no payload types. A name that the reader's app owns (`api`, `fetchUser`) is declared in `scripts/docs-stubs.d.ts`; add one only when a snippet needs it. A block whose first line is a comment with a file name (`// bus.js`) is written under that name in the folder of its `##` section, so a later block of the section can import it (`./bus`); two sections can use the same name, as two examples would be two apps. A section that goes on with the files of the one before it has `<!-- docs-check: continue -->` under its heading, and `<!-- docs-check: new -->` starts new files in the middle of a section, and `<!-- docs-check: fork -->` starts new files that begin as a copy of the ones before. Libraries the project does not install (`react`, `vue`, `pinia`, `nanostores`, `valtio`) are declared as `any` modules in the same file. A block that cannot be checked gets `<!-- docs-check: skip - reason -->` on the line before its fence.

### New docs page

Add every new page of `docs/` to `llms.txt` (one link with a one-line description, in reading order): `pnpm llms:check` fails when one is missing.

### Clarity checklist

What / when? Install? Main action? Result? How to adapt? Where are more options? For a new API: problem, why this call, what if I skip it? For a type block: does this change runtime, or only the checker?

**Readability review:** heading + first lines state the goal; one idea per paragraph; steps in order; terms consistent; example reproducible; prerequisites / limits / errors explicit; no unexplained abbreviations or vague pronouns; page scannable via headings / lists / tables; reader can finish the task without guessing or extra hops.

### Code examples

Correct, current, copy-ready. Common path first. No dead helpers / types / imports. Same naming. State env setup when required. Docs prose: JS fences when the snippet is untyped. `examples/*.ts`: recipe-shaped; checker types quarantined and explained (see above).

**Low cognitive load in code.** One step per line in teaching examples. Do not nest `await` inside another call (`dispatch(fn(await …))`), chain three new APIs on one line, or pack fetch + transform + emit into a single expression. Name the intermediate (`const user = await …; store.dispatch(userLoaded(user))`). A call inside a call inside a call gets a name (`const trace = createTracer(consoleLogger()); createBus({ trace })`, not `createBus({ trace: createTracer(consoleLogger()) })`), and an object passed to a library call with two or more options goes one property per line. Check every snippet you write against this before you finish. Dense one-liners belong in reference for experts, not in README / guide / first recipe.

**Comment nanoeffects calls in the snippet.** Next to each use of a library API (`createBus`, `createEffectsMiddleware`, `latest`, `retry`, `createModule`, …) put a short comment on what it does in this example — even if the prose above already said it. Readers skim code first. Foreign APIs (RTK `createAction`, `configureStore`) may get a one-word tag (`// RTK`) when mixed with ours so the boundary is obvious.

**Files of an example: the bus, the events, the handlers.** When an example needs a bus and events, it shows them as files, one job each (single responsibility): `bus.js` (`bus.ts` in a `ts` block) holds only the bus and what its plugins give out (`createBus().use(…)`, `export const { useEmitter } = bus`); the events (`createAction`, `createCommand`, `createJob`) are in a file named after the domain (`search.js`, `user.js`); the handlers, which know both, are in a third (`search-handlers.js`) or in a module. The bus file imports no events and the events file imports no bus, so a use looks like `import { bus, useEmitter } from "./bus"; import { queryChanged, searchLoaded } from "./search";`. Name the files without a prefix of the example, because the folder of the `##` section is the example. An example of one or two lines with string events (`bus.on("greet", …)`) stays one block; so does the first snippet of the README.

**Names in a snippet must be local.** Every variable, function, or import a reader sees used (`double`, `getUser`, `api`, `bus`, …) is defined in **that same snippet**, or in the immediately preceding snippet on the same page that the text treats as one continuous example. Do not rely on “from an earlier section” for names that are not restated — a reader skimming §9 should not need §7 open. Placeholders (`api.user`) are fine if named as external; invented bindings must appear.

### Readiness

A JS developer who has not read the source can quickly see the purpose, install and run the minimal example, adapt it, and find one further feature without reading every page.

**Non-goal:** docs are not for business analysts. BA tooling is a later product idea, not a documentation requirement.

## Decisions that are easy to undo by mistake

- **`createBus` stays tiny** (about 1.4 kB gzip, 1.3 kB brotli; `size-limit` measures brotli). A task context lets one emit through after an abort while `ctx[emitAfterAbort]` is set (`src/core/emit-key.ts`); only `createJob` sets it, for its `cancel`. Anything optional goes to another entry: tracing machinery is in `nanoeffects/trace`, commands in `nanoeffects/actions`. The main entry has `createBus` and the types a bus needs, and nothing else: `contextPlugin` and its types `NoClash` and `ContextTask` are in `nanoeffects/context`, the tracing types (`Tracer`, `Trace`, `TraceEvent`, `TraceLogger`, `Phase`, `EffectName`) in `nanoeffects/trace`, and the plugin keys `anyEventType` and `commandCall` are not public (the definitions stay in `src/core`, which `src/tests/exports.test.ts` and `types.test.ts` guard), so a bundler that does not tree-shake does not carry them. The bus only knows two interfaces, `Tracer` and `Commands`. Measure before and after a change to `src/core`: bundle `createBus` with rolldown and compress it with brotli.
- **A plugin is a function of the bus.** `bus.use(plugin)` is one line, `plugin(bus)`, and returns what the plugin returns; modules are `bus.use(modulePlugin(modules))`, and `nanoeffects/dev` is a plugin as well. The bus exposes `context`, `trace`, `commands` and `addContext` (called with every new task context; chain to the previous one) for them. There is no list of plugins, no order, no merging of results and no plugin option in `createBus` (`composeBus` was built and removed as too much): do not add them unless the owner asks. A plugin that **refines the bus shape** (event map / context fields), such as `effectsPlugin` in `nanoeffects/effects` and `contextPlugin` in `nanoeffects` (fields typed from the value; `NoClash` rejects a repeated name), returns the same bus typed with those fields (`Bus<E & WithContext<…>>`) so `const bus = createBus().use(effectsPlugin({ race }))` keeps one binding; plugins that only attach an API (`commandsPlugin`, `modulePlugin`, `devPlugin`) still return that API. `emitterPlugin` (`nanoeffects/actions`) adds `bus.emitter(creator)` for callbacks of state managers; it uses only `bus.emit`, so the core has no hook for it, and creators are never bound to a bus (calling one only builds the action).
- **`ctx` is the first argument of every effect** (`retry(ctx, fn, options)`), so `...rest` can follow later. Outside a task pass `{}` or anything with a `signal`.
- **`emit` is a plain synchronous loop.** The first handler error stops the rest and is thrown, unless `onError` is set; then handlers are isolated. Async rejections are not handled without `onError`.
- **An aborted task delivers no result.** Promises reject with the abort reason; `ctx.emit` and `ctx.on` do nothing after an abort. One shared `onAbort` hub per signal (one real listener each) keeps thousands of subscribers cheap.
- **Tracing is a contract, not a feature of the bus.** `Tracer` in `src/core/tracer.ts`; events `{ id, parent?, type, effect, phase, payload, error? }`; phases `start|done|error|cancel|drop`; sampling is per root task. The causal parent comes from `currentEmitter()`, which `ctx.emit` sets for the time of the synchronous emit.
- **`notrace` build.** `TRACE` in `src/core/flag.ts` reads `__NANOEFFECTS_TRACE__`; the second tsdown build defines it as `false`. `scripts/notrace-types.mjs` rewrites `trace?: Tracer;` of `BusOptions` to `never` in the `.d.ts` of that build, so it must keep matching that exact line in `src/core/bus.ts`. The package exports have the `notrace` condition for `.`, `effects`, `policies`, `actions`.
- **User fields in the context** are typed through the event map: `type Events = {...} & WithContext<{ store: Store }>` (a type-only symbol key in `src/core/bus.ts`, read by `ContextOf<E>`), filled with `createBus({ context })`, which can also be a function of the task (`ContextOption`); `createEffectsMiddleware` uses the function form to give each task a `store` that knows which task dispatches. `createTask` takes one object, `{ event, bus?, tracer?, parent? }`. Library fields win over them. There is no global interface any more.
- **Scopes are a plugin, not core** (`nanoeffects/scope`). A scope is a flat object: every key goes on `ctx` as it is, except `$effects` (functions with `{ signal }` first, bound to the task; a key named `effects` is an ordinary field). It is the last argument of `createCommand` / `createAction` / `createModule`, the fourth of `createJob` (after its outcomes), and the second of `emit` for call forms (never the string form). The creators only keep the scope on the call (a symbol, `src/core/scope-key.ts`, which `createBus` does not import); `scopePlugin` wraps `bus.emit` to set `pending` for the tasks that emit starts, adds them in the chained `bus.addContext` (it matches a context to the emit by type and payload: a known limit, a hook in core would remove it), and implements `bus.applyScope` / `bus.fitScope` for modules. A scope is ignored without the plugin on purpose (no check in core, types or dev). Strongest first: `emit`, action/command/job, module, bus; library fields never replaced. The values of a scope are read each time it is put on a task (a cached plan went stale when a scope was changed): keep the per-task work to plain property writes, and measure with `scripts/bench-scope.mjs` (the numbers are in the design of the change). A generic user effect keeps its type parameters only through `Effect<F>` or `effect(fn)` as a value of the scope: TypeScript erases them in a mapped type.
- **`nanoeffects/oop` is a function of a bus, not a plugin.** `extendBus(bus, Base)` builds a subclass with `Reflect.construct(Base, args, new.target)` (no `class` mixin, so no `any[]`), puts `on`, `once`, `off` (getters that make per-instance versions), `emit`, the function members of the bus (read when it runs; plugins used later are not seen), `dispose`, `Symbol.dispose` and `bus` on the prototype, and skips a name that `Base.prototype` has: the class wins. What an instance subscribed to lives in a `WeakMap` outside the instance (`this.on` runs in the constructor of `Base`, before the fields of a subclass exist). `@On` / `@Once` keep `{ event, wrap, once }` in a `WeakMap` keyed by the **function** of the method, for both kinds of decorators, and the class scans its prototype chain once; the test toolchain does not parse `@`, so tests call the decorators as functions. `this` in a handler given by hand is never bound. The slots of the bus (`ctx`, `commands`, `trace`, `addContext`, `applyScope`, `fitScope`, `app`, `use`) are not copied. `extendBus(bus)` with no class extends an empty base. `Emitter<E>` (`src/oop/emitter.ts`) is the other way in: a base class with a bus of its own **for each instance** (a `WeakMap`, made at first use, so it works in a parent constructor; no static `bus`, no plugin methods). Its `on`, `once`, `off` and `emit` are prototype members that the constructor binds with `bind` (the most derived one is bound, so a subclass can replace one with an arrow property; a method of that name is TS2425 because the types are `Bus<E>["on"]`, whose overloads are not copied). `Subject(source, event)` takes any object with `on` and `emit`, so `new Subject(this, …)` over an instance goes through its `on` and ends with `dispose()`, with no code in `oop`; it has no `complete`, `error` or replay on purpose (an event of a bus does not end, and the bus keeps no values).
- **Plugins are tested together.** `src/tests/plugin-matrix.test.ts` puts every plugin on a bus in every order of two and in 300 orders of all of them, and runs a probe for each plugin and for the pairs that use each other. A new plugin adds an installer and its probes there. A probe that fails for an order is a bug: plugins work in any order, with no exceptions. That is why `modulePlugin` makes nothing at `bus.use`: its root task and its initial modules wait for the first use of the app or the first `bus.emit`, or, when the list is not empty, for the end of the synchronous block (`queueMicrotask`), so every plugin used in that block is on the bus and an app that uses nothing at start still mounts its modules (an error of a `setup` at that start is reported, not thrown; `modulePlugin()` with no module schedules nothing), and `on`, `once` and `off` made in between are held (`src/actions/hold.ts`) and made right after the modules, which keeps the listeners of a module ahead of them. `commandsPlugin` merges into the registry the bus has, `effectsPlugin` and `contextPlugin` leave a field that is on `ctx`, and `devPlugin()` reads the app from `bus.app`. Keep it that way when you add a plugin: no work at `bus.use` that a later plugin could miss, and no replacing of what another plugin put on the bus.
- **`matchPlugin` (`nanoeffects/match`) is the predicate overload of `on` / `once` / `off`, as a plugin.** A function with no string `type` is a predicate (a creator or a command has one); it gets `{ type, payload }`, rides on `"*"` (one task per event for each such subscription, and it counts as heard for `onUnhandled`), and `off` finds it through a `Map`. It wraps the methods it finds when it is used, so it works in any order with `devPlugin`, which counts a predicate under `"*"` and whose `disconnect` restores `bus.on` only if its wrapper is still on top. `ctx.on` takes a predicate at run time, not in the types. Keep the core out of it.
- **Names for the trace are a plugin, `tracePlugin` (`nanoeffects/trace`), and are options that do nothing without it.** `traceGroupId` (in the scope of a command, a job, an action, or the options of an emitter), `traceId` (of `useEmitter` and `bus.emitter`, and the third argument of `bus.on` and `once`) are read only when the bus has a tracer and the plugin is used; otherwise they are ignored, handlers run as they are, and the types are the same either way (`On<E>` has the options in `src/core/bus.ts`, so a plugin used on a condition compiles). The plugin wraps `bus.emit` to make the call that is being emitted known for the synchronous time of the emit (`src/core/trace-call.ts`; the tracer reads its `traceGroupId` in `createTracer`), puts the function that makes the root of an emitter on the bus under `originKey` (`src/core/origin-key.ts`; `reactPlugin` and `emitterPlugin` read it each time and fall back to `bus.emit`), and names a listener by renaming its own task (`renameTask`, the optional `rename` of `Tracer`). `createBus` knows none of it: do not pass the emitted call through `bus.ts`, `createTask` or `Tracer.task` again. A method that wraps `on` or `once` must pass the options on (`matchPlugin`, the `on` of a module and `extendBus` do). There is no `production` export build of `nanoeffects/trace`: it also holds the loggers that the docs use in production, and the plugin does nothing without a tracer. A trace event has `parentId`, `rootId` and `traceGroupId`; `rootId` links a task to its root through a listener that reports nothing.
- **Commands are attached to a bus that exists**: `createBus` has no `commands` option. `bus.use(commandsPlugin(bindings?))` makes the registry and sets `bus.commands`; `modulePlugin` does it when the bus has none; a custom runner is `bus.commands = { run }`. `emit` reads `bus.commands` each time. `m.use(...)` in a module brings sub-modules and commands that carry a handler (a command is bound to itself); `m.handle` gives an explicit handler. Do not bring the constructor option back.
- **Modules are known by name**: mounting a module whose name is taken unmounts the old one first (hot reload, see `docs/hmr.md`).
- **Dev diagnostics are a separate entry, `nanoeffects/dev`**, and are a no-op in production by the `production` export condition (a second build of `src/dev/noop.ts` in `dist/production/`), not by a flag. Core and actions carry no dev code: `devPlugin` (used as `bus.use(devPlugin())`; it finds the app in `bus.app`, or takes the `app` option) wraps `bus.on`, `app.mount` and `app.unmount` and `disconnect` restores them.
- **`onUnhandled`** is called for an event without listeners (not for commands).
- **Timers use `setTimer`/`clearTimer`** (`src/utils/timer.ts`), never `setTimeout` directly: waits over 2^31 - 1 ms are split, `Infinity` holds no timer, negative or `NaN` is 0.
- **Options that are `null`** (plain JavaScript callers) fall back to defaults: read options with `??`, not with destructuring defaults.
- **`throttle` and `debounce` follow lodash** (and patronum): verified by `src/policies/lodash-parity.test.ts` with random call sequences against the real lodash (a devDependency). `throttle` has a re-entrancy guard (`busy`) so a call made from inside `fn` waits; the leading-only modes use no timers.
- **`store.remove(key, task)` removes one registration** of a task that was added twice. The store keeps a `Map` of task to count (in the order of the first add), so adding and removing cost the same at 50 000 subscribers; `get` builds the array once and hands out that same array until the next change, so an emit that still walks it is not disturbed. A task added twice is listed twice next to its first place, and one that was removed and added again goes to the end.
- **Queue:** the slot is freed before the caller is resolved; aborting a running call resolves it with `undefined` at once; a waiting call that is already aborted when its turn comes is skipped.
- **Policies tell the job about each call** (`src/core/lifecycle-key.ts`, `src/policies/lifecycle.ts`). `createJob` puts a lifecycle (`start`, `drop`, `cancel`, `done`) on the context of a call under a symbol key; `keyed()`, which every library policy returns through, marks its task with `reportsLifecycle`, and `job.wrap` reads that mark once. Marked handlers send `pending` at `start`, nothing for a call that is dropped before it started, `cancel` for a started call that a policy aborts; unmarked ones (no policy, your own policy, a policy hidden in a function) send `pending` at the call. Each `pending` has exactly one closing outcome and none is sent without it, so a counter is exact and a boolean flag is exact when calls do not overlap. `queue` reports `done` before it frees the slot, so the closing outcome comes before the next `pending`. A new policy goes through `keyed()` and uses `startCall`, `dropCall` and `endCall`.
- **Commands:** the bus runs `options.commands?.run ?? callCommand`. A handler bound in the registry wins over the command's own. A missing handler throws `MissingHandlerError` synchronously, also for jobs.

## Changes with OpenSpec

**Changes that touch behavior or the public surface go through OpenSpec.** Do not edit code, docs or scripts on a request to build, change or fix something like that until there is a change under `openspec/changes/` for it: propose first (`/opsx:propose`), stop when the artifacts are ready, and implement only on `/opsx:apply`. Update the artifacts when the work shows they are wrong, and archive the change when it is done. The only exception is when the owner says in the request to skip OpenSpec (a typo, a one-line fix, "just do it"). Planning uses `openspec/`: `/opsx:propose "idea"` makes a change with `proposal.md`, a spec delta, `design.md` and `tasks.md` under `openspec/changes/<name>/`; planning stops there, and the owner starts `/opsx:apply` when the plan is accepted; `/opsx:archive` moves the delta into `openspec/specs/`. `openspec/config.yaml` holds the project context for the artifacts. `.claude/` and `.agents/` hold the generated commands and skills (`openspec update` refreshes them).

Do not run everything through OpenSpec by reflex. Think first: when a request is a sketch, a question, or a design still being talked through ("what if…", "show me how it would look"), answer in the conversation with a draft, a snippet or a trade-off, and open a change only once the owner has settled on a direction. Do not propose a change per message of a discussion, and do not rewrite the artifacts of an open change after every new idea: collect the decisions, then update them once. Small edits that do not change behavior or the public surface (wording in docs, a note in this file, a rename inside a test, a dependency bump) need no change.

Bug fixes follow the same line. When the code does not do what a spec or the docs already say, fix the code, add a test that fails without the fix, and note it in `CHANGELOG.md` under `Unreleased`: the spec is right and stays as it is. Open a change when the fix settles behavior that the specs leave open or contradict, or when it alters what a caller can observe (a result, a type, an error), because that changes the contract; the delta keeps the next reader from "fixing" it back.

## Code rules

- **Readability lint (`lint/*.grit`, for `src` and `examples`, not tests)**: no `as unknown as`, no casts inside call arguments, no two `?.` in one `const`/`let`/`return`, no ternary inside `??`, `||`, `&&`, and no arrow that calls a function with a callback that also calls one (`() => timeout(ctx, 5000, ({ signal }) => api.search(q, { signal }))`: too many operations on a line). Name the inner function or the step, or write a helper instead. The rule is about the shape, so keep the same care in docs and tests. Biome also limits cognitive complexity to 15 and forbids nested ternaries.
- **No `undefined` identifier** (`noRestrictedGlobals`): use `void 0`, `typeof x === "number"` and the like.
- **`index.ts` files contain only re-exports.**
- **Few extra types**, but add one where a signature gets hard to read (`Binding`, `Emittable`, `ModuleApi`). Do not make the code general ("implement" is too wide a name; name things by what they do).
- **Comments** say why, not what; match the density of the file you edit. Keep doc comments on public API with an `@example`.
- **Tests: no abbreviations.** Use `harness`, `handler`, `value`, `gate`, `debounced`, `command`, `moduleContext`... not `h`, `fn`, `n`, `d`, `deb`, `cmd`, `m`. `ctx`, `bus`, `app`, `ms`, `id` are names of the API and stay. Pin generics in test helpers (`queue<number, TestEvents, void>`). For a payload that is `undefined` at runtime use `noPayload` from `src/tests/test-helpers.ts`.
- `createAction("x")` without generics returns a `FreeActionCreator`: it keeps the literal type, and the payload type comes from the event map (the overloads of `On` in `src/core/bus.ts` put it before `ActionCreator<P>` and commands; keep that order). `createAction<Payload>("x")` gives the payload type instead.
- `src/tests/types.test.ts` checks what users see from the type checker (inference of handlers, policies, effects, commands; wrong calls with `@ts-expect-error`). `pnpm tsgo` runs it. A `@ts-expect-error` must sit above the line where TypeScript reports the error, which for a failed overload is the first argument of `bus.on`, not the inner call.
- `src/tests/architecture.test.ts` (ArchUnitTS) keeps the layers: `src/core` imports nothing from `actions`, `dev`, `effects`, `policies`, `store` or `trace` (types included), and the layers above it have no import cycles. A type both need goes down into `src/core` (as `action-creator.ts` did). It needs `globals: true` in `vitest.config.ts`: ArchUnitTS adds its matcher to the global `expect`.
- Tests use fake timers for anything with time; `createHarness()` gives a bus that records its trace and fresh task contexts (`harness.ctx()`).

## Releasing

npm publishing goes through GitHub Actions with npm trusted publishing (no token): the package settings on npmjs.com name this repository and the workflow `release.yml`. To release:

1. Write the notes under `## <version>` in `CHANGELOG.md`, and set the same `version` in `package.json` (`npm version <x> --no-git-tag-version`) and in `packages/create-nanoeffects/package.json` (`npm version <x> --no-git-tag-version --prefix packages/create-nanoeffects`): the two packages always have one version, and the project that `create-nanoeffects` makes depends on `^<that version>` of `nanoeffects`.

   The text of the GitHub release is that section, made by `scripts/release-notes.mjs`, so write it to be read on a release page:
   - Sections by what the reader must do: `### Breaking` (code or setup must change; say how to get the old behavior), `### Changed` (another behavior, rarely breaking), `### Added`, `### Fixed`. Leave out an empty one.
   - One bullet is one or two lines: what it is and how to turn it on. Put the rest in `docs/` and link it (`[Docs](docs/tracing.md#anchor)`; the script makes the links absolute).
   - No bundle sizes, test counts, internals or design notes. Those belong to the commit and to `openspec/`.
   - Nest bullets only to list the parts of one feature, one level deep.
   - Check a release text with `node scripts/release-notes.mjs v<version>`. To fix a published release: `node scripts/release-notes.mjs v<version> > notes.md && gh release edit v<version> --notes-file notes.md`.
2. `pnpm verify` (what CI runs), commit.
3. Tag and push: `git tag v<version> && git push origin main v<version>`. The `Release` workflow checks that the tag, both `package.json` files and the changelog agree, runs `verify` and `smoke`, publishes `nanoeffects` and then `create-nanoeffects` with provenance, and creates the GitHub release from the changelog. If the second publish fails, `nanoeffects` is already out: re-run the failed step, do not re-tag. Both packages need a trusted publisher for `release.yml` on npmjs.com (the first publish of a new name is done by hand once to claim it).
4. After the release, `pnpm consumer-check` installs `nanoeffects@latest` into a clean project, type-checks the README example and runs it. Do not publish from a laptop: provenance works only from Actions, and a published version cannot be replaced.

## Tooling notes

- `lefthook.yml`: pre-commit runs biome with `--write` and `stage_fixed`, and `tsgo`; the output is plain text with one line per error because the VS Code git dialog shows only the start of it. Lefthook stashes unstaged changes, so the hook checks the staged content: stage fixed files again if the hook complains about something you already fixed.
- `biome.json` `files.includes` has `!lint`: the Biome formatter would turn the `.grit` rules into unreadable one-liners.
- Mass renames in tests were done with the TypeScript language service (`findRenameLocations`), not with regular expressions: do the same for large renames.
- Bundle size check: `dist/index.js` with its chunks, and a rolldown bundle of `createBus` alone.

## Where things stand

Done: bus with task contexts; policies with `key`; effects; commands, actions, jobs (`pending`, `success`, `fail`, `cancel`, which follow the policies through the lifecycle that `src/policies/lifecycle.ts` reports to), modules; `context` option; `signalPlugin` (`emit(call, { signal })`); `withPolicy` and `usePolicy` (a policy as a plain function, and in a React component); tracing with loggers and the `notrace` build; about 1800 tests (lodash parity, fuzz, regressions from issues of other libraries).

Done: the Redux adapters. Zustand and MobX have no adapter on purpose (`bindSource` was built and removed as too much; the README shows the plain recipe). Ideas the owner has talked about and not started: a `sample: 0` fast path in the tracer. The owner said that "complicating can be done later": prefer the simple version first.
