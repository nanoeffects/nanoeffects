# Tasks

Apply `bus-use-plugins` first: this change builds on `bus.use` and `modulePlugin`.

## 1. The dev plugin

- [x] 1.1 `src/dev/plugin.ts`: `devPlugin(options?)` returns a plugin `(bus) => disconnect` with the leak warning (per-event count, once per excess, re-armed) and `disconnect()` that restores `bus.on`. Verify: unit tests through `bus.use(devPlugin(...))` for the limit, removal, re-arming and disconnect pass.
- [x] 1.2 Module messages: with `app`, wrap `app.mount` and `app.unmount` (mounted, replaced, unmounted), restored by `disconnect()`. Verify: unit tests with `bus.use(modulePlugin(...))` for a first mount, a replacement by name and an unmount.
- [x] 1.3 Options `maxListeners`, `leaks`, `modules`, `log`; defaults as in the design. Verify: tests for each option and for the custom `log`.
- [x] 1.4 A bus and an app with the plugin behave as without it. Verify: tests that events, unsubscribe and mounting give the same results with and without the plugin.
- [x] 1.5 `src/dev/noop.ts` with the same signature, returning a plugin that does nothing; `src/dev/index.ts` re-exports only. Verify: a test that the no-op plugin returns a function and leaves `bus.on` and `app.mount` untouched.

## 2. Build and package

- [x] 2.1 `tsdown.config.ts`: `dev` in the main build, and a build of `noop.ts` as `dist/production/dev.js`; `package.json` `exports["./dev"]` with `production` first, `types`, `import`. Verify: `pnpm build` produces both and `pnpm lint:package` (`publint`, `attw`) passes.
- [x] 2.2 `size-limit` entries for `dev` and for the production no-op. Verify: `pnpm size` passes.
- [x] 2.3 Bundler tests in `integration/bundlers.test.ts` through `bus.use(devPlugin(...))`: Vite and webpack in production mode contain none of the dev code and the plugin is a no-op; development mode contains it; an app that does not import the entry does not contain it. Verify: `pnpm test:integration` passes.

## 3. Docs

- [x] 3.1 Delete `examples/hmr.ts` and `examples/env.d.ts`; rewrite `docs/hmr.md` to describe replacement by name and `bus.use(devPlugin({ app }))` (no `import.meta.hot` code); update the entries table in `README.md` and the `docs/README.md` index. Verify: no dangling links and `pnpm tsgo` is clean.
- [x] 3.2 `AGENTS.md` (layout and the decision: dev diagnostics live in `nanoeffects/dev` as a plugin, production is a no-op by export condition, nothing in core) and `CHANGELOG.md`. Verify: both match the docs.

## 4. Verification

- [x] 4.1 `pnpm verify` passes, `createBus` stays within its size limit. Verify: the command exits 0.

## Workflow follow-up

- After apply: `openspec archive dev-diagnostics` moves the delta into `openspec/specs/dev-diagnostics/`.
