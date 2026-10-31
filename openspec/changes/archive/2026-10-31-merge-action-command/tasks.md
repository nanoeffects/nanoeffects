## 1. Core: rename the slot and ask the registry

- [x] 1.1 Measure `createBus` alone (rolldown, brotli) and `pnpm size`, and keep the numbers as the "before"
- [x] 1.2 In `src/core/bus.ts` rename the `commands` slot and `Commands` interface to `actions` and `Actions`; add an optional `bound?(type)` to `Actions`; in `emit` use `commandOf(event) ?? bus.actions?.bound?.(key)` before `onUnhandled` is decided; update doc comments and `src/index.ts` types
- [x] 1.3 Measure again: put before and after in the commit message; raise the `size-limit` entry only if it fails, with the reason (createBus 1.29 → 1297 B, limit kept 1.3 kB; actions 3.06 → 3285 B, limit raised from 3.1 to 3.3 kB: createCommand's code, prepare and the registry `bound` now live there)
- [x] 1.4 Tests in `src/core` / `src/tests`: a bound handler on a plain action runs and its result is returned, listeners are told first, the string form and a plain `{ type, payload }` work, unbinding returns to an event, a bound type does not call `onUnhandled`, an unbound one does and does not throw, a bus without `actions` is unchanged, a custom runner `{ run }` without `bound` still runs commands, the 50 000 subscribers test is not slower; run `src/tests/architecture.test.ts`

## 2. Registry and plugin rename

- [x] 2.1 In `src/actions/command.ts` rename `commandsPlugin` → `actionsPlugin`; the registry returns `bound` (a command-like function with the type when something is bound); `setHandler` and `handle` accept any action; keep `Registry` and `Binding`; `bus.actions` is the slot a custom runner assigns (`{ run }`, `bound` optional)
- [x] 2.2 In `src/actions/module.ts` rename `app.commands` → `app.actions`; `m.handle` accepts an action made without a handler; the module plugin attaches `actionsPlugin()` when the bus has no registry
- [x] 2.3 Update every other reader of the old names: `src/dev`, `src/trace`, `src/react`, `src/store`, `src/oop` (search for `commands`, `commandsPlugin`, `Commands`), `scripts/`, `integration/`
- [x] 2.4 Update `src/actions/command-registry.test.ts`, `command-trace.test.ts`, `module*.test.ts`, `job.test.ts` for the new names; add: a job whose handler the registry binds still sends `pending`/`success`/`fail`/`cancel`; `createCommand` without a handler still throws `MissingHandlerError`; a plain action does not
- [x] 2.5 Add the probe for a registry-bound plain action to `src/tests/plugin-matrix.test.ts` (every order of two and 300 orders of all, with `actionsPlugin` in the list); run `pnpm vitest run`

## 3. `createAction` takes the form of `createCommand`

- [x] 3.1 Move the code of `createCommand` into `createAction` (`src/actions/action.ts`): signature `createAction(type, handler?, scope?)`, types of the creator with and without a handler, `Call<P, R>` as the payload generic (`createAction<Call<Mail, void>>(type)`), scope fields as before; keep `makeCommand` (not exported) for `createJob` and `MissingHandlerError` for it
- [x] 3.2 Runtime: a function second argument is the handler and the third is `{ prepare, ...scope }`; an object second argument is `{ handle, prepare, ...scope }` (function-valued `handle` and `prepare` are taken out, the rest is the scope); missing is an event
- [x] 3.2b Tell the context of a task from an argument of a `prepare` creator by what the context has (an `AbortSignal` as `signal` and an `emit` function) in `createAction`, so `prepare` and a handler work together; no marker in `src/core` was needed (decision changed while implementing, see `design.md`)
- [x] 3.3 Remove `createCommand` from `src/actions/index.ts` and `src/index.ts` exports; update `src/tests/exports.test.ts`; keep the public types (`Command`, `CommandCall`) that the bus needs
- [x] 3.4 Doc comments with an `@example` for `createAction` (handler form, `Call`, `prepare` option)
- [x] 3.5 Move and rename the tests of `createCommand` (`command.test.ts`, `command-trace.test.ts`, registry and module tests) to `createAction`; add: result through `emit`, calling builds the action without running the handler, no handler is still an event, `createAction(type, scope)`, `{ handle, prepare, ...scope }`, `handler` + third `{ prepare, ...scope }`, `prepare` with a handler emitted through `bus.emit`, a `prepare` creator called with two plain objects, a scope that has another function field, a policy (`latest`) around the handler, scope on a bus with `scopePlugin`, the `"command"` trace phase, `m.use` and `m.handle`, a job whose handler is bound in the registry
- [x] 3.6 Types in `src/tests/types.test.ts`: `P` and `R` inferred from the handler, `Call<P, R>` declared, `emit` returns `R`, wrong payload is an error, a plain action emits `void`, `prepare` as an option infers its arguments

## 3b. Result types for a string emit

- [x] 3b.1 Add the `Call<Payload, Result>` type in `src/core` (type only, a unique-symbol marker) and export it from the main entry as a type; make `EventPayload` and the `emit` overloads read it, leaving plain entries as they are
- [x] 3b.2 Add the overload `emit<R = void>(type: string extends EventKey<E> ? string : never, ...payload: unknown[]): R` to `Emit`, first (on a bus without a map the `K extends string` overload would otherwise take `emit<string>("x")` and return `void`)
- [x] 3b.3 Types in `src/tests/types.test.ts`: `emit<string>("x")` is `string` on a bus without a map, `emit("x")` is `void`, `emit<string>` on a bus with a map is an error (`@ts-expect-error`), a wrong payload and a misspelt name are still errors there, `Call<void, string>` gives `string`, plain entries unchanged; check that the bundle of `createBus` is unchanged (types only)

## 4. Size and surface

- [x] 4.1 `src/tests/exports.test.ts` and `public-surface`: the new name `actionsPlugin` is exported, `commandsPlugin` is not; update `package.json` exports docs if they list it
- [x] 4.2 `pnpm build` (both builds), `pnpm size`, `pnpm smoke`, `pnpm types:ts5`, `pnpm lint:package`

## 5. Docs and examples

- [x] 5.1 `docs/actions.md`: first example `createAction` with `handle`; one line that an action with a handler is a command and one without is an event; then the registry section (`actionsPlugin`, `setHandler`, `actions.handle`, bound to a plain action, the `void` type caveat); `createCommand` as the typed contract last
- [x] 5.2 Rename and re-teach in `docs/guide.md`, `docs/plugins.md`, `docs/scope.md`, `docs/query-libraries.md`, `docs/chat-example.md`, `docs/package.md`, `docs/hmr.md` and any other page found by a search for `commands` / `commandsPlugin` / `createCommand`; each snippet follows the AGENTS.md rules (local names, a comment on each library call, JS first)
- [x] 5.3 Update `examples/` (type-checked), `packages/create-nanoeffects/templates/*` (`domains-ts` uses `createCommand`) and their tests if they use the old names; `llms.txt` only if a page title changes
- [x] 5.4 `pnpm docs:check`, `pnpm llms:check`, `pnpm templates:check`

- [x] 5.5 Simplify the wording of the pages that still say "command" for an action with a handler (`scope.md`, `query-libraries.md`, `server.md`, `typescript.md`, `chat-example.md`, `starter.md`, `context.md`, `hmr.md`, `plugins.md`): the owner asked to simplify the docs now that commands are not a separate entity

## 6. Release notes and finish

- [x] 6.1 `CHANGELOG.md` under `Unreleased`: `### Breaking` (`createCommand` removed and the renames, `bindHandler` → `setHandler` included, with the search-and-replace migration), `### Added` (the handler in `createAction`, `Call` and `emit<R>`; a handler can be bound to any action), `### Changed` (`createAction(type, fn)` is a handler, `prepare` is an option)
- [x] 6.2 `pnpm format && pnpm tsgo && pnpm check && pnpm docs:check && pnpm llms:check && pnpm vitest run && pnpm build`, then `pnpm verify`
- [x] 6.3 Archive the change (`/opsx:archive`) when done
