# Tasks

## 1. The type

- [x] 1.1 Define `WithSignal` beside `WithType` in `src/core/bus.ts` and export it from `src/index.ts`. Make `Signaled` in `src/core/effect-types.ts` an alias of it, and keep it exported from `src/scope/index.ts`. Use `WithSignal` for the required `{ signal: AbortSignal }` in `src/effects/poll.ts`, `src/effects/cancellable.ts`, `src/scope/effect.ts` and `src/core/effect-types.ts`, found by grep. Leave the optional `{ signal?: AbortSignal }` forms. Verify with `pnpm tsgo` and `pnpm vitest run src/tests`.
- [x] 1.2 Types in `src/tests/types.test.ts`: `WithSignal` accepts a task context, `{ signal }` and an `EffectContext` (`{ signal, abort }`), and rejects an object with no `signal` and an object with an optional `signal` (`@ts-expect-error`); `Signaled` from `nanoeffects/scope` is the same type. Verify with `pnpm tsgo`.

## 2. Use it where people copy it

- [x] 2.1 Replace the hand-written required `{ signal: AbortSignal }` in `examples/*.ts`, `examples/playground-react/fake-api.ts` and `examples/chat/src` (the client and the starter of the search) with `WithSignal`, importing it from `nanoeffects`. Leave a different shape, such as `{ signal, abort }`, as it is. Verify with `pnpm tsgo` and `pnpm check`.
- [x] 2.2 Do the same in `packages/create-nanoeffects/templates/react-ts`, `vanilla-ts`, `vue-ts` and `domains-ts` (`api.ts` and the handlers). The JavaScript templates do not change. Verify with `pnpm templates:check` and `pnpm vitest run packages/create-nanoeffects`.

## 3. Docs

- [x] 3.1 Change the blocks of `docs/*.md` that write `{ signal: AbortSignal }` (`docs/oop.md` and the ones found by grep) to `WithSignal` where the block is TypeScript, with `import type { WithSignal } from "nanoeffects"`. Add a short paragraph to `docs/typescript.md`. Add the line to `CHANGELOG.md` under `Unreleased` (`### Added`). Verify with `pnpm docs:check` and `pnpm llms:check`.

## 4. Integration

- [x] 4.1 Run `pnpm format && pnpm tsgo && pnpm check && pnpm docs:check && pnpm llms:check && pnpm templates:check && pnpm vitest run && pnpm build && pnpm smoke && pnpm lint:package && pnpm size`. Verify all pass, and that `createBus` did not change in size.
