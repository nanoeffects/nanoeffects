# Design

## Context

Observed imports between domains today (events and commands only; no handler or store crosses):

| Chat | What it imports |
| ---- | --------------- |
| `messages` → `incoming` | `messageReceived` (to add a received message) |
| `messages` → `rooms` | `roomSelected` (to load the history of the room) |
| `search` → `rooms` | `roomSelected` (its module and `goToResult`) |
| `search` → `messages` | `loadHistory`, `markMessage` (`goToResult`) |

The pokédex has one: `abilities` → `pokemon` (`findPokemon`). `markMessage` is a command whose handler calls the store of `messages`, so a command of an entity is also its public order. The `domains-ts` template has no import between domains and stays as it is. `src/tests/architecture.test.ts` already uses ArchUnitTS (`projectFiles`, `inFolder`, `dependOnFiles`); the installed version (2.5.4) also has a `slices` API. See proposal.md for why.

## Goals / Non-Goals

**Goals:**
- No import between two units of the same layer, and none upwards, in both examples, with a test.
- The same screens and event names; the move is checked by running the apps.

**Non-Goals:**
- The template, the other examples, library code.

## Decisions

- **Layers of Feature-Sliced Design, in a reduced form.** `shared` / `entities` / `features` / top (`ui`, `app.ts`, `main.tsx`). FSD also has `widgets` and `pages`; two examples this size do not need them, and the docs say so in one line. The names are singular for an entity (`room`, `message`) and a verb phrase for a feature (`show-history`), as in FSD.
- **Why not one shared `events/` folder.** It would remove the imports and keep the coupling: every unit can still listen to every other, and nothing says who may react to whom. The layers say it: an entity is a thing with its own state and orders, a feature is a scenario that connects things.
- **The behavior that crossed entities becomes a feature.** `messages` reacted to `roomSelected` and `search` reacted to `roomSelected`; the first is "show the history of the selected room" and becomes `show-history`, a module with one listener (`roomSelected` → `ctx.emit(loadHistory(roomId))`). `search-messages` keeps its own copy of the selected room, filled from the same event, as `search` did.
- **`messageReceived` moves to the message entity.** It is a fact about messages ("one arrived"), the entity listens to it to update its list, and the feature `receive-messages` imports it to emit it. The old `incoming.ts` goes away; `receive-messages` keeps only the poll and its module.
- **`clearAbilities` is a command of the `ability` entity.** It follows `markMessage`: a command that carries its handler (the store's `clear`), bound with `module.use`. `show-abilities` emits it, so the store of an entity is written only by its own module.
- **Moving `bus.ts` and `api.ts` into `shared/`.** They are the two files every layer uses; putting them in a folder makes the layer rule checkable with one pattern. The bus file keeps its rule (no events, no entity). Imports in `ui/`, `app.ts` and `main.tsx` change from `../bus` to `../shared/bus`.
- **`ui/` stays one folder.** Components import entity stores and events and feature stores and events directly, as they do now.
- **The test.** In `src/tests/architecture.test.ts`, one `describe` over the two examples:
  - a rule per entity and per feature folder for what it must not import (another entity, a feature, `ui`; another feature, `ui`), built from the folder lists the test reads from the disk, so a new unit is checked at once;
  - one rule that `shared` imports nothing above it.
  The rules are one function that takes the root folder of an example, so the same code checks both. The `slices` API of ArchUnitTS is used when it expresses "no dependency between the slices of a folder" in one call; if it does not fit the path patterns, the per-folder rules do the same. To show that the rule can fail, one case runs it over a fixture, `src/tests/fixtures/layers/`, in which an entity imports another entity, and expects a violation.
- **`app.ts` mounts the modules in the order the chat needs.** The order that exists (`rooms` last, because it starts loading when mounted) is kept and the comment is updated to the new names: entities first, then features, then `room` last.
- **Docs.** `docs/chat-example.md` changes its title and its file table; the paragraph "a domain reacts to another domain by listening to its events" becomes the layer rule, with the same example (`roomSelected` heard by a feature); the snippets that import from `./messages` import from the entity paths. `docs/starter.md` says that the chat has more layers than `domains-ts`. The CHANGELOG entry is under `### Changed`.

## Risks / Trade-offs

- [Moving files breaks hot paths nobody tests] → both apps are run in a browser after the move: rooms load, a send, a failed send, search, open result, incoming, pokémon search, random, abilities.
- [`docs/chat-example.md` snippets drift from the code] → `pnpm docs:check` checks the blocks, and the file table is checked by reading the folder in the task list.
- [FSD names put off a reader who does not know it] → the page explains the three layers in two sentences and does not use the rest of the vocabulary.
- [The `domains-ts` template and the chat now differ] → said in `docs/starter.md`; the template keeps "domains" because its two domains do not talk to each other.

## Open Questions

None that change the specs.
