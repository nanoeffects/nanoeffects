# Tasks

## 1. The slot

- [x] 1.1 Add `src/utils/caller.ts` (`wantCaller`, `withCaller(call, saved?)`, `takeCaller`), export it from `src/utils/index.ts` if the other helpers are, and keep `createBus` from importing it.
- [x] 1.2 Tests in `src/utils/caller.test.ts`: nothing read when not wanted, the stack read once for nested calls, reset after a throw, reset after return, a nested registration inside a handler, a saved stack is used, two frames are the user's.

## 2. Use it in the trace plugin

- [x] 2.1 `src/trace/plugin.ts`: call `wantCaller()` for `source: true`; take the slot or read the stack through `withCaller`; `sourceFrom(stack, 2)`.
- [x] 2.2 `src/trace/source.ts`: remove `import.meta.url`, the package root and the `node_modules` segment; update `source.test.ts` (drop the root tests, keep the formats, the missing stack and the count).

## 3. The wrappers

- [x] 3.1 `src/match/plugin.ts`, `src/signal/plugin.ts`, `src/dev/plugin.ts`: `withCaller` in the body of the wrapper of `on` and `once`.
- [x] 3.2 `src/actions/hold.ts`: save the stack at the call (`Held.stack`), replay with `withCaller(call, held.stack)`; `src/actions/module.ts`: `withCaller` in `listenWith`.
- [x] 3.3 `src/oop/extend.ts`: `withCaller` in `methodsOf` (`on`, `once`) and in `forwarding`; check `@On`, `@Once` and `Emitter`.
- [x] 3.4 Tests for each wrapper next to its code: the source is the line of the call.

## 4. The matrix and the rule

- [x] 4.1 `src/tests/plugin-matrix.test.ts`: make the source probe strict (the file of the probe, in every order); add probes for `m.on`, an `extendBus` instance and a registration held by `modulePlugin`.
- [x] 4.2 `AGENTS.md`: the rule next to "pass the options on" that a method that wraps `on` or `once` calls `withCaller` directly in its body, and the note about `ctx.on`.
- [x] 4.3 Measure `createBus` before and after (unchanged), `pnpm size` for `match`, `signal`, `dev`, `actions`, `oop` and `trace`; raise a limit only as far as measured. Try `ctx.on` and leave it out if `createBus` grows.

## 5. Docs

- [x] 5.1 `docs/tracing.md` and `docs/ru/tracing.md`: drop the limit about wrappers in a bundle, keep minified code, source maps and no stack; say that a plugin of your own that wraps `on` calls `withCaller`, or leave that to the AGENTS rule if it is not public; check that `docs:check` passes.
- [x] 5.2 `CHANGELOG.md` under `Unreleased`: `### Fixed`.
- [x] 5.3 Run `pnpm format && pnpm tsgo && pnpm check && pnpm docs:check && pnpm llms:check && pnpm docs:site && pnpm vitest run && pnpm build`, then `pnpm verify`.
