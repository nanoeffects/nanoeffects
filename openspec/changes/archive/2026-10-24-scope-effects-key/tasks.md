# Tasks: scope-effects-key

## 1. Types and plugin
- [x] 1.1 Rename the property in `Scope`, `EmitScope` (`src/core/scope-types.ts`), `BoundEffects` and the `Omit` in `FieldsOfScope` (`src/scope/types.ts`), `put` (`src/scope/plugin.ts`) and `beneath` (`src/actions/carry.ts`); update the doc comments of `src/actions/*.ts` and `src/scope/*.ts` that show the key. Verify: `pnpm tsgo` fails only in tests and docs that still use `effects`, and `src/scope/plugin.ts` has no read of `layer.effects`

## 2. Tests
- [x] 2.1 Use `$effects` in `src/scope/*.test.ts`, `src/tests/types.test.ts` and `src/tests/scope-layers.test.ts`; add a runtime test where a scope `{ effects: { retries: 3 } }` puts that object on `ctx` and binds nothing, and a type test where `ctx.effects` has the type of that object. Verify: `pnpm tsgo && pnpm vitest run`

## 3. Docs and release notes
- [x] 3.1 Use `$effects` in `docs/scope.md`, `docs/actions.md` and `examples/scope.ts`; say once in `docs/scope.md` that `$effects` is the one reserved name and `effects` is an ordinary field. Verify: `pnpm docs:check && pnpm tsgo`
- [x] 3.2 CHANGELOG `Unreleased` entry marked **BREAKING** with the migration (`effects` to `$effects` in every scope, and what happens if it is not renamed), and the AGENTS.md line about scopes. Verify: reads next to the neighbouring entries

## 4. Verify
- [x] 4.1 Run `pnpm format && pnpm tsgo && pnpm check && pnpm docs:check && pnpm llms:check && pnpm vitest run && pnpm build && pnpm size`, then `pnpm verify`. Verify: all green

## Workflow follow-up
- The owner chooses the version (0.7.0 recommended) when the release is prepared; this change does not bump it.
