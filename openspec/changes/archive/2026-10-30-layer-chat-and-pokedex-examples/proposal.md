# Proposal

## Why

The two big examples split their code into domains, and the domains import each other. In the chat, `messages` imports `incoming` and `rooms`, and `search` imports `rooms` and `messages`; in the pokédex, `abilities` imports `pokemon`. The imports are of events and commands, not of handlers or stores, but a reader still copies the shape: a domain that knows the files of its neighbours. A project built on that shape ends with a web of imports and with domains that cannot be removed. The point of a bus is that the parts talk through events without knowing each other, and the examples should show a layout in which that stays true.

## What Changes

- Both examples move to the layers of Feature-Sliced Design: `shared`, `entities`, `features`, then `ui`, `app.ts` and `main.tsx` on top. The rule: an entity imports `shared` only; a feature imports `shared` and entities, never another feature; the top imports anything below. No import between two entities and none between two features.
- **Chat** (`examples/chat/src`): `shared/` gets `bus.ts` and `api.ts`. `entities/room` and `entities/message` keep their events, store, handlers and module; `messageReceived` moves into `message` as "a message arrived from outside", and `message` no longer listens to `roomSelected`. Three features carry the behavior that crosses entities: `show-history` (a selected room starts a history load), `receive-messages` (the former `incoming`: it polls and emits `messageReceived`), and `search-messages` (the former `search`).
- **Pokédex** (`examples/pokedex/src`): `shared/`, `entities/pokemon`, `entities/ability` and the feature `show-abilities`, which empties the abilities and loads the ones of a found pokémon. `ability` gets a `clearAbilities` command, so no feature writes the store of an entity.
- The apps behave as before: the same event names, the same outcomes, the same screens. This is a move and a small rewiring.
- A test keeps it that way: it fails on an import between two entities, between two features, or from a lower layer to a higher one.
- Docs follow: `docs/chat-example.md` (title, the file table, the paragraph on how parts talk, the snippets), a sentence in `docs/starter.md` (the chat no longer has the layout of `domains-ts`, which is unchanged), `docs/actions.md`, `llms.txt`, `examples/README.md` and the READMEs of both examples. `CHANGELOG.md` under `Unreleased`.

Out of scope: the `domains-ts` template (it has no import between domains), the other examples, library code, and any change in `src/` other than the architecture test.

## Capabilities

### New Capabilities
- `example-layers`: the layers, the import rule and the test, with the layout of the chat and of the pokédex.

### Modified Capabilities
- `chat-example`: the logic is split by layers and not by domains; the polling and the state belong to a feature or an entity.

## Impact

- `examples/chat/src` and `examples/pokedex/src`: files move and imports change; no new dependency.
- `src/tests/architecture.test.ts` (new rules over `examples/chat/src` and `examples/pokedex/src`).
- `docs/chat-example.md`, `docs/starter.md`, `docs/actions.md`, `llms.txt`, `examples/README.md`, the READMEs of the two examples, `CHANGELOG.md`.
- The library, its size limits and its public types do not change.
