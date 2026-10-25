# Tasks: plugin-order

## 1. Safe fixes first
- [x] 1.1 `effectsPlugin` skips a field that is on the context (`src/effects/plugin.ts`), with tests in its test file: the field stays, a `ctx.run` child gets effects bound to itself, a scope wins in either order of `scopePlugin` and `effectsPlugin`. Verify: `pnpm vitest run src/effects src/scope`
- [x] 1.2 `commandsPlugin` merges into the registry of the bus (`src/actions/command.ts`), with tests in `command-registry.test.ts`: two uses share one registry, after `modulePlugin` both run, a custom runner is replaced; the old "replacement" test is removed. Verify: `pnpm vitest run src/actions`

## 2. Lazy modules and the slot
- [x] 2.1 Types only, and not in `Bus`: `ModuleHost` and `WithApp` in `src/actions/module.ts`, `ScopeSlots` (`applyScope`, `fitScope`, moved out of `Bus`) in `src/scope/types.ts`; the plugins take and return the bus with their slots. `createBus` must be the same bytes. Verify: `pnpm tsgo`, the architecture test
- [x] 2.2 `modulePlugin` starts lazily and holds the subscriptions (`src/actions/module.ts`): the root task and the initial modules on the first `bus.emit` or call of the app, `started` set before mounting, `dispose` before the start, `bus.app = app`; `on`, `once`, `off` held and replayed in order after the initial modules, the wrapper restored or passing through. Tests in `module-plugin.test.ts` for every scenario of `bus-plugins`: initial modules wait, a plugin used after is seen, `mount` before the start mounts after the initial ones, `dispose` first, `setup` that emits does not start twice, the slot, module listeners ahead of later `bus.on`, a listener before the plugin stays first, unsubscribe and `off` before and after the replay, `once`, order of held calls, a predicate with `matchPlugin` in either order, a `bus.on` from inside a `setup`, `devPlugin` counts. Check a plain emit after the start is not slower in a measurable way. Verify: `pnpm vitest run src/actions`
- [x] 2.3 `devPlugin()` finds the app (`src/dev/plugin.ts`, `types.ts`): the slot when set, else the accessor that watches the app when `modulePlugin` assigns it; `disconnect` restores everything; `devPlugin({ app })` still wins. Tests for both orders and for a disconnect before the app exists. If the accessor fails, take the fallback in `design.md`. Verify: `pnpm vitest run src/dev`

## 3. The matrix
- [x] 3.1 Remove every `explained` exception and its table from `src/tests/plugin-matrix.test.ts`; probes also run with the modules mounted before and after the other plugins. All orders of pairs and 300 random orders pass. Verify: `pnpm vitest run src/tests/plugin-matrix`

## 4. Documentation
- [x] 4.1 Remove "Follow the order" from `docs/plugins.md` and add a short "Use them in any order" paragraph with the lazy start, and that `bus.on` after the plugin is live at the first use; remove the order sentences in `docs/scope.md`, `docs/actions.md` ("Use `modulePlugin` after the other plugins", "A second plugin on the same bus replaces it"), `docs/hmr.md` if any, the JSDoc of `scopePlugin`, `modulePlugin`, `commandsPlugin`, `devPlugin`, and the rule in `AGENTS.md` ("The rule that matters most…", "Use it after `effectsPlugin`… and before `modulePlugin`"). Verify: `pnpm docs:check && pnpm llms:check`
- [x] 4.2 `CHANGELOG.md` `Unreleased`: the modules start on the first use (`bus.on` calls in between are held and keep their order), a second `commandsPlugin` merges, `effectsPlugin` keeps an existing field, `devPlugin()` finds the app. Mark the first two as behavior changes. Verify: read the entry

## 5. Verify
- [x] 5.1 `pnpm format && pnpm tsgo && pnpm check && pnpm docs:check && pnpm llms:check && pnpm vitest run && pnpm build`, then `pnpm size` (core unchanged) and `pnpm verify`. Verify: all green

## Workflow follow-up
- Archive with `/opsx:archive`; the version is the owner's choice when the release is prepared.
