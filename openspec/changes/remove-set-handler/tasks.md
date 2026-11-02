## 1. Code

- [x] 1.1 `src/actions/handled.ts`: remove `setHandler`, `Binding`, the `bindings` parameter of `actionsPlugin` and the `handle(bindings)` overload and branch; update the doc comments and `@example`s to `actions.handle`. Tests: update `handled.test.ts`, `handled-registry.test.ts`, `module-start.test.ts`; add a test that `actionsPlugin()` twice returns one registry with the earlier handler kept.
- [x] 1.2 `src/actions/module.ts`: remove the `handle(bindings)` overload, the array branch of the wrapper and `Binding` import; fix the `@example`. Tests: update `module.test.ts` and `src/scope/places.test.ts` to `handle(action, fn)`.
- [x] 1.3 `src/actions/index.ts`: stop exporting `setHandler` and `Binding`. Tests: `src/tests/exports.test.ts` drops `"setHandler"`; `src/tests/types.test.ts` uses `actions.handle` and adds `@ts-expect-error` for `actionsPlugin([...])` and `m.handle([...])`.

## 2. Docs and examples

- [x] 2.1 `docs/actions.md` and `docs/ru/actions.md`: bind with `actions.handle`; drop the `setHandler` explanation; keep the code blocks equal (comments may differ).
- [x] 2.2 `docs/guide.md` and `docs/ru/guide.md` §8: same; the text says "bind the real handler with `actions.handle` when the bus is made; a later `handle` wins until you remove it".
- [x] 2.3 `examples/guide.ts`: use `actions.handle`. Check `llms.txt`, `README.md` and `docs/recipes.md` for `setHandler`. Tests: `pnpm docs:check`, `pnpm llms:check`, `pnpm tsgo`.

## 3. Changelog and verification

- [x] 3.1 `CHANGELOG.md`: add `## Unreleased` with `### Breaking` (removed `setHandler`, `Binding`, `actionsPlugin(bindings)`, `handle([...])`; migration line; docs link).
- [x] 3.2 Run `pnpm format && pnpm tsgo && pnpm check && pnpm docs:check && pnpm llms:check && pnpm vitest run && pnpm build`, then `pnpm verify`; check `pnpm size` for `actions`.
