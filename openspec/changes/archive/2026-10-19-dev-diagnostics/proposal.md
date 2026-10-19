# Proposal

## Why

During hot reload a developer gets no signal when something goes wrong or happens: a file that calls `bus.on` again piles up listeners and every event is handled twice, and a module that was replaced by name does so in silence. Both are easy to notice with one line of output, and neither belongs in a production bundle.

## What Changes

- New entry `nanoeffects/dev` with `devPlugin(options?)`, a plugin: `const disconnect = bus.use(devPlugin({ app }))`. The plugin returns `disconnect()`. It builds on `bus.use` from the change `bus-use-plugins`.
- Leak warning: when the number of listeners of one event exceeds `maxListeners` (default 10), it logs one warning for that event that names the event and the count and points to a listener that is added again without being removed (a reloaded file, a missing unsubscribe).
- Module messages: with `app` (what `registerModules` returns) it logs when a module is mounted, replaced by name and unmounted, e.g. `module "user" replaced`.
- Both can be turned off one by one, and the log function can be replaced.
- In a production build the entry is a no-op: `package.json` maps `nanoeffects/dev` to an empty build under the `production` export condition, which Vite and webpack set by themselves in production mode, so `bus.use(devPlugin({ app }))` can be written without a guard and costs a few bytes there. An unconditional import that is never called is tree-shaken as before.
- `examples/hmr.ts` is removed, and `docs/hmr.md` describes the behavior and the dev entry without a code example for `import.meta.hot`.

## Capabilities

### New Capabilities
- `dev-diagnostics`: what `devPlugin` reports (leaked listeners, module mount, replacement and unmount), how to connect and disconnect it, and that a production build carries none of it.

### Modified Capabilities

## Impact

- Code: new `src/dev/` (an `index.ts` that re-exports, `connect.ts`, `noop.ts`); no change to `src/core`, `src/actions` or `createBus`.
- Build and package: a `dev` entry in `tsdown.config.ts` and a no-op `dev` under `dist/production/`; `exports` gets `./dev` with the `production` condition first; `size-limit` gets entries for both.
- Tests: unit tests for `devPlugin`; a bundler test (Vite and webpack, production mode) that the dev code is absent.
- Docs: `docs/hmr.md`, `README.md` (entries table), `AGENTS.md` (layout and the decision), `CHANGELOG.md`; `examples/hmr.ts` is deleted.
- Depends on `bus.use` and `modulePlugin` from `bus-use-plugins`: apply that change first.
- No new dependency.
