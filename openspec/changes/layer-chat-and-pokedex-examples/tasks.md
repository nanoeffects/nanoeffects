# Tasks

## 1. The chat

- [x] 1.1 Move `bus.ts` and `api.ts` of both examples into `shared/` and fix the imports. Verify with `pnpm tsgo` and `pnpm check`.
- [x] 1.2 Chat entities: `git mv` the rooms and messages domains to `entities/room` and `entities/message`; move `messageReceived` into `entities/message`; remove the `roomSelected` listener from the message module. Verify with `pnpm tsgo`.
- [x] 1.3 Chat features: create `features/show-history`, move `incoming` to `features/receive-messages` and `search` to `features/search-messages`, update `app.ts` (the modules and the comment on the order) and the components. Verify with `pnpm tsgo` and `pnpm check`.
- [x] 1.4 Run the chat in a browser: rooms load, a send, a failed send (`/fail`), a quick room switch, a search and opening a result in another room, incoming messages, the toggle of incoming. Verify the same results as before the move.

## 2. The pokédex

- [x] 2.1 Move `pokemon` and `abilities` to `entities/pokemon` and `entities/ability`, add the command `clearAbilities` bound by the ability module, add the feature `features/show-abilities`, and update `app.ts` and the components. Verify with `pnpm tsgo` and `pnpm check`.
- [x] 2.2 Run the pokédex in a browser: a search, a 404, random, abilities that load after the pokémon and are emptied by a new search. Verify the same results as before the move.

## 3. The guard

- [x] 3.1 Extend `src/tests/architecture.test.ts` with the layer rules for `examples/chat/src` and `examples/pokedex/src` (no entity → entity, no feature → feature, nothing upwards, `shared` imports nothing above), reading the unit folders from the disk, and add the fixture check that the rule finds a known violation. Verify with `pnpm vitest run src/tests/architecture.test.ts`.

## 4. Docs and integration

- [x] 4.1 Update `docs/chat-example.md` (title, file table, the paragraph on how parts talk, the snippets, the wait-for-a-room section), the sentence in `docs/starter.md`, `docs/actions.md`, `llms.txt`, `examples/README.md`, the READMEs of the two examples, and `CHANGELOG.md` under `Unreleased` (`### Changed`). Verify with `pnpm docs:check` and `pnpm llms:check`.
- [x] 4.2 Run `pnpm format && pnpm tsgo && pnpm check && pnpm docs:check && pnpm llms:check && pnpm templates:check && pnpm vitest run && pnpm build`. Verify all pass.
