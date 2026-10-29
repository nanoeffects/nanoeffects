# Tasks

## 1. The scheduled start

- [x] 1.1 In `src/actions/module.ts`, schedule `start()` with `queueMicrotask` at the end of `modulePlugin` when the initial list is not empty. The scheduled call does nothing when the app is running already. An error of it goes to `report` and does not throw. Move the replay of the held calls into a `finally`, so a throwing `setup` does not lose them. Verify with `pnpm tsgo`.
- [x] 1.2 Tests in `src/actions/module-start.test.ts` (and the other test files that assume a lazy start, found by running them): no use at all mounts after `await Promise.resolve()`; an earlier first use mounts at that use and not again; an empty or missing list schedules nothing and the held calls stay held; `dispose()` before the microtask leaves the initial modules unmounted; a `setup` that throws at the scheduled start is reported, rolls the list back, replays the held listeners, and leaves the app usable; the start also runs under fake timers. Verify with `pnpm vitest run src/actions`.
- [x] 1.3 Add a probe to `src/tests/plugin-matrix.test.ts` that a plugin used after `modulePlugin` in the same synchronous block reaches the modules without any use of the bus, in every order. Verify with `pnpm vitest run src/tests/plugin-matrix.test.ts` and `src/dev`.

## 2. Docs, the record and the example

- [x] 2.1 Update `docs/actions.md` (the bullet about the initial modules and the explicit-mount paragraph) and `docs/plugins.md` ("Modules start on the first use"): when the initial modules mount, the limit of a plugin used after an `await`, and how to get the old behavior. Update the decision in `AGENTS.md`. Add the line to `CHANGELOG.md` under `Unreleased` (`### Changed`). Verify with `pnpm docs:check` and `pnpm llms:check`.
- [x] 2.2 Change `examples/chat/src/app.ts` to pass the four modules to `modulePlugin` and drop the `app.mount` call, and update `docs/chat-example.md` if it names the mount order. Verify with `pnpm tsgo`, `pnpm check`, and by running the example against its server that the rooms load without a click.

## 3. Size and integration

- [x] 3.1 Measure `pnpm build && pnpm size`; raise the `actions` limit in `package.json` only by the measured growth. Verify `pnpm size` passes.
- [x] 3.2 Run `pnpm format && pnpm tsgo && pnpm check && pnpm docs:check && pnpm llms:check && pnpm templates:check && pnpm vitest run && pnpm build && pnpm smoke`. Verify all pass.
