## 1. Core names

- [x] 1.1 Rename `Command` to `Handled` and `CommandCall` to `HandledCall` in `src/core/bus.ts` and `src/index.ts`; rename `makeCommandCall`, `commandOf`, `commandCall`, `callCommand` and the comments. Done when `pnpm tsgo` passes and `grep -rn "Command" src/core src/index.ts` finds nothing.
- [x] 1.2 Rename the trace effect `"command"` to `"action"` in `EffectName` (`src/core/types.ts`) and in `traceRun` in `emit`. Done when the trace tests that expect the effect pass with `"action"`.
- [x] 1.3 Measure `createBus` (rolldown, brotli) before and after. Done when it stays at or under 1.3 kB (`pnpm size`).

## 2. Actions layer

- [x] 2.1 `git mv src/actions/command.ts src/actions/handled.ts`; rename `makeCommand`, `buildCommand`, `MadeCommand`, `ScopedCommand`, and the `commands` variable and comments in `module.ts`, `job.ts`, `action.ts`. Done when `grep -rniE "command" src --include=*.ts -l` lists no file outside prose that means a shell command.
- [x] 2.2 Change the text of `MissingHandlerError` to `No handler for action "<type>"`. Done when the tests of `job` and the registry assert the new text.
- [x] 2.3 Check `src/scope`, `src/signal`, `src/trace`, `src/match` and `scripts/bench-scope.mjs` for the word and rename. Done when `pnpm tsgo` and `node scripts/bench-scope.mjs` run.

## 3. Tests

- [x] 3.1 `git mv` the tests (`command.test.ts`, `command-registry.test.ts`, `command-trace.test.ts`) to the new names and update their titles. Done when `pnpm vitest run` passes.
- [x] 3.2 Update `src/tests/exports.test.ts` and `src/tests/types.test.ts` for `Handled` and `HandledCall`, with a `@ts-expect-error` that `Command` is not exported from the root. Done when `pnpm tsgo` passes.
- [x] 3.3 Add the guard: a test that fails when a name in the `.d.ts` of any entry contains `Command`. Done when it fails after a temporary `export type CommandX = 1` and passes without it.

## 4. Docs and the rest

- [x] 4.1 Edit prose by hand in `docs/` (`server.md`, `query-libraries.md`, `scope.md`, `plugins.md`, `typescript.md`, `tracing.md`, `actions.md`, `README.md`, `context.md`), leaving `docs/starter.md` alone. In `docs/tracing.md` change the sample output `command start`/`command done` to `action start`/`action done`; fix the dead anchor `#let-a-test-replace-a-handler-commandsplugin` in `docs/plugins.md`. Done when `grep -rniE "command" docs` lists only `starter.md`.
- [x] 4.2 Remove the sentence about "command" from the glossary in `docs/actions.md`. Done when the glossary has four rows and no mention.
- [x] 4.3 Edit `examples/` (`scope.ts`, `README.md`, `api-server`, `trades`, `spells`, `rickandmorty`), `skills/nanoeffects/SKILL.md` (`bus.emit(command(payload))` becomes `bus.emit(action(payload))`), `llms.txt` and `AGENTS.md`. Done when `pnpm docs:check` and `pnpm llms:check` pass and `grep -rniE "command" examples skills llms.txt AGENTS.md` finds only shell commands.
- [x] 4.4 `CHANGELOG.md`, `## Unreleased`, `### Breaking`: the types `Command`/`CommandCall` are `Handled`/`HandledCall`, the trace effect is `"action"`, the error text says `action`. Done when `node scripts/release-notes.mjs` reads cleanly.

## 5. Verify

- [x] 5.1 Run `pnpm format && pnpm tsgo && pnpm check && pnpm docs:check && pnpm llms:check && pnpm vitest run && pnpm build`. Done when all pass.
- [x] 5.2 Run `pnpm test:integration`, `pnpm lint:package` and `pnpm size`. Done when they pass.

## Workflow follow-up

- Archive with `/opsx:archive`; the deltas rename requirements in `command-action-call`, `command-registry` and `job-outcomes`, and add to `trace-types` and `public-surface`.
- The prose of `command-match`, `module-commands`, `scope-context` and `trace-group` still uses the word; it is editorial and can be tidied at archive.
