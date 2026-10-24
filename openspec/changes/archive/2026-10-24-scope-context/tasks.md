# Tasks: scopePlugin

## 1. Types first (gate)
- [x] 1.1 Move `Helpers` / `Bound` / `BoundOf` from `src/effects/plugin.ts` to a type module in `src/core`; widen `Helpers` to any `(ctx: { signal }, …) => unknown`, add `Strip` and `Effect<F>` (reads `[bound]`). `effectsPlugin` accepts user effects and `Effect<F>`. Verify: `pnpm tsgo`, `architecture.test.ts` (core imports nothing from `effects`)
- [x] 1.2 Type tests for effects: a plain user effect is typed without `ctx`; a generic plain one is erased (`unknown`); `Effect<<T>(items: T[]) => T>` gives `string` for `["a"]` and `number` for `[1]` next to a plain function in the same object; a function without `{ signal }` first is an error; the user's own `race` is not typed as the built-in. Verify: `pnpm tsgo`
- [x] 1.3 **Gate, nothing below starts until it passes.** Add `Scope`, `Merge`, `Scoped`, `WithScope`, `EmitScope` and check in `src/tests/types.test.ts` that `createCommand("x", (id, { cache }) => …, { cache })` infers `cache` before the handler is typed; that a scope field replaces a bus field; that `Omit` keeps the keys of both a literal map and `EventMap`; that `effect(first)` keeps `<T>`. Verify: `pnpm tsgo`. If inference fails, stop and amend `design.md` decision 8 with the owner before going on
- [x] 1.4 `Emit` (second parameter on the two call forms only) and `On` (creator overload before the existing ones); `@ts-expect-error` for a wrong override type, a scope on the string `emit`, and an effect without `{ signal }`, each on the line where TypeScript reports. Verify: `pnpm tsgo`

## 2. The plugin
- [x] 2.1 New entry: `src/scope/` with `scopePlugin`, `effect` (typed `(…a: A) => R`, records `fn` in a `WeakSet`), the symbol file in `src/core` (not imported by `createBus`), optional `Bus.applyScope`. Wire `package.json` exports, the `entry` list of the main build in `tsdown.config.ts` (minified, tree-shaken; not the `notrace` build, the plugin traces nothing), `size-limit` and the architecture test for the new layer. Verify: `pnpm build`, `pnpm lint:package`, `pnpm size`
- [x] 2.2 `emit` wrapper with `pending` and `try … finally`; `addContext` applies call layers in order (values copied, `effect` values bound, `effects` bound), never over library fields; the keys of call layers in a `WeakMap`. Verify: `src/scope/plugin.test.ts` for precedence, library fields, the string form untouched, a scope on a bus without the plugin ignored silently
- [x] 2.3 Children: wrap `ctx.run` so a child copies the call-layer fields of its parent, including a child made after an `await`; `forkTask` children and `retry` attempts keep them. Verify: tests for `ctx.run`, `retry`, `all`
- [x] 2.4 Errors and nesting: a throw in a listener and in a nested emit leaves no scope behind; two buses in one tick do not mix; an async rejection with `onError` set. Verify: tests
- [x] 2.5 Order with other plugins: `scopePlugin` last wins over `effectsPlugin` and `contextPlugin`; used first, the documented result. Verify: test of both orders

## 3. Actions, commands, jobs, modules
- [x] 3.1 `createAction(type, scope)` and `createAction(type, prepare, scope)`: the creator keeps the scope, the call carries it. Verify: `action.test.ts` (listeners see the fields; `match` and `toString` unchanged) and a type test
- [x] 3.2 `createCommand(type, handler, scope)`: the call carries it; a handler bound with `commands.handle` still gets it. Verify: `command.test.ts`
- [x] 3.3 `createJob(type, handler, { success, fail }, scope)`: scope on the job's command; `success` / `fail` listeners see it. Verify: `job.test.ts`
- [x] 3.4 `createModule(name, setup, scope)` and `app.createModule(…)`: wrap `m.on`, `m.handle`, `m.use(command)`, `m.spawn` through `bus.applyScope`; call layers win; other modules and outside listeners do not see it; unmount undoes as before; an HMR re-mount (same name) uses the scope of the new version. Verify: `module.test.ts`
- [x] 3.5 Without the plugin every scope above is ignored with no error: one test per place. Verify: `pnpm vitest run`

## 4. Leaks and performance
- [x] 4.1 Leak tests with `WeakRef` and `global.gc` (as in the `effectsPlugin` leak test): many tasks with plain values, `effects` and `effect` values; a per-call scope with a large object is collectable after `emit` returns; module unmount releases its scope and contexts; a task that is aborted while a bound effect waits; `pending` and the `WeakMap` hold nothing after the run. Verify: the leak tests run in `pnpm vitest run` (they ask Node for `gc` at run time, so no flag; a control test that keeps a context checks that the check can fail)
- [x] 4.2 `scripts/bench-scope.mjs` (not part of `verify`): 100 000 tasks on HEAD without the plugin, with the plugin and no scope, with a scope of 3 fields, and 10 batches of 10 000 with a scope (time per batch and heap after gc). Write the numbers into the Budgets table of `design.md`. Verify: the table is filled and meets its rules; if not, apply the fallback in design Risks and measure again
- [x] 4.3 Core size: bundle `createBus` alone (rolldown + gzip) at HEAD and after; record both. Verify: equal; `pnpm size` for `nanoeffects/scope` and `nanoeffects/actions` within limits set from the measured numbers

## 5. Cross-module tests
- [x] 5.1 One regression in `src/tests/` with bus, module, command and `emit` all setting the same key; one fuzz-style case over random layer orders against a simple model. Verify: `pnpm vitest run`

## 6. Documentation with examples
- [x] 6.1 New `docs/scope.md`, JavaScript first, one job per section: turn on `scopePlugin` (and say it is ignored without it, and that it goes last), command with its own fields, command with `effects` (built-in `race` and `delay`), a user-written effect with the `{ signal }` annotation, a generic effect with `effect(fn)` and, for TypeScript, with `Effect<F>` in "Typing (optional)", the limit of a plain generic function, job, action, module, `emit` override in a test, the precedence table (strongest first: `emit`, action / command / job, module, bus). Each use of a library call has a short comment; each name is defined in its snippet. Verify: `pnpm docs:check`
- [x] 6.2 A short section with a link in `docs/context.md`, `docs/actions.md` and `docs/effects.md` (what counts as an effect; anything else is a plain key of the scope); `docs/package.md` entry for the new entry and types; `docs/typescript.md` only if the inference notes are needed to use it. Verify: `pnpm docs:check`
- [x] 6.3 `examples/scope.ts`: recipe-shaped, checker types in a labelled block. `examples/README.md` index line. Verify: `pnpm tsgo`
- [x] 6.4 `llms.txt`: one link to `docs/scope.md` with a one-line description, in reading order. Verify: `pnpm llms:check`
- [x] 6.5 README stays as it is (levels A to B only). Verify: the diff of `README.md` is empty

## 7. Release notes and rules
- [x] 7.1 CHANGELOG `Unreleased`; one line in `AGENTS.md` (scope is a plugin in `nanoeffects/scope`, ignored without it; `pending` + `addContext`; precedence order; string `emit` takes no scope; `scopePlugin` last). Verify: reads next to the neighbouring entries
- [x] 7.2 Run `pnpm format && pnpm tsgo && pnpm check && pnpm docs:check && pnpm llms:check && pnpm vitest run && pnpm build`, then `pnpm verify`. Verify: all green

## Workflow follow-up
- Archive `effects-plugin` first, then this change (`/opsx:archive`), so the wider `effectsPlugin` rule is amended by a delta.
