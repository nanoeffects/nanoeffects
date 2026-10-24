# Tasks: contextPlugin

## 1. Base
- [x] 1.1 Measure `createBus` (size-limit, brotli) before the change: 1296 B (limit 1.3 kB); `actions (all)` 1842 B
- [x] 1.2 Entry: the main entry `nanoeffects`. With the plugin exported there `createBus` measures 1297 B (+1 B, under the limit), the other entries do not change

## 2. Plugin
- [x] 2.1 `contextPlugin(fields | (task) => fields)` in a file of its own: chain to the previous `bus.addContext`, set a field only if the context has no such key; doc comment with `@example`
- [x] 2.2 `NoClash` for the plugin (move the check `effectsPlugin` has to where both can use it, or copy it if that is simpler); return the same bus typed `Bus<E & WithContext<F>>`
- [x] 2.3 Export it from the chosen entry; update `src/tests/exports.test.ts`
- [x] 2.4 Measured again: `createBus` 1297 B (+1 B from 1296 B; the plugin is tree-shaken, the byte is not explained further)

## 3. Tests
- [x] 3.1 Runtime: fields on a handler, a `ctx.run` child, a task of an effect and a module handler; function form gets `{ type, payload }`; two plugins and the `context` option merge; a present field is kept; library fields win; returns the same bus
- [x] 3.2 Types in `src/tests/types.test.ts`: inference with an event map (payload still typed) and without; function form; composition with `effectsPlugin` in both orders and with `EventsOf`; repeated name is `@ts-expect-error`; the old `createBus<Events>({ context })` form unchanged
- [x] 3.3 Run the whole suite: no change in existing tests

## 4. Docs and examples
- [x] 4.1 `docs/context.md`: the plugin as the typed way, the option as the JavaScript way, the merge and the clash rule
- [x] 4.2 `docs/stores.md`: unchanged on purpose. `createEffectsMiddleware` makes its own bus and fills `store` itself, so the recipe cannot call `use`; `WithContext` stays there, and `docs/context.md` says when to use it
- [x] 4.3 `docs/typescript.md` and `examples/typescript-context/bus.ts`: `type Events = { "user/loaded": User }` and `contextPlugin({ store })`, no `WithContext`
- [x] 4.4 `CHANGELOG.md` Unreleased; one line in `AGENTS.md` if the plugin adds a convention

## 5. Finish
- [x] 5.1 `pnpm format && pnpm tsgo && pnpm check && pnpm docs:check && pnpm vitest run && pnpm build && pnpm size`
