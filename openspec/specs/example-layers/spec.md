# example-layers Specification

## Purpose
TBD - created by archiving change layer-chat-and-pokedex-examples. Update Purpose after archive.

## Requirements

### Requirement: The big examples are split into layers that import downwards only
`examples/chat/src` and `examples/pokedex/src` SHALL be split into the layers `shared`, `entities` and `features`, with `ui`, `app.ts` and `main.tsx` on top. `shared` SHALL hold the bus and the server client and SHALL import nothing from a higher layer. An entity SHALL import `shared` and its own files only. A feature SHALL import `shared`, entities and its own files, and SHALL NOT import another feature. The top SHALL import any lower layer. No file SHALL import a layer above its own.

#### Scenario: An entity does not know its neighbour
- **WHEN** the files of an entity are read
- **THEN** none imports another entity, a feature or `ui`

#### Scenario: A feature does not know another feature
- **WHEN** the files of a feature are read
- **THEN** none imports another feature

#### Scenario: The bus imports no events
- **WHEN** `shared/bus.ts` is read
- **THEN** it imports no event, no entity and no feature

### Requirement: The rule is checked by a test
The architecture test of the repository SHALL fail when a file of either example imports a file of another entity, of another feature, or of a layer above its own.

#### Scenario: A forbidden import
- **WHEN** a file of an entity imports a file of another entity
- **THEN** the architecture test fails and names the file

#### Scenario: The examples pass
- **WHEN** `pnpm vitest run src/tests/architecture.test.ts` runs
- **THEN** it passes for both examples

### Requirement: The chat is split into two entities and three features
The chat SHALL have the entities `room` and `message` and the features `show-history`, `receive-messages` and `search-messages`. Each entity and feature SHALL keep its events, handlers, store (if it has state) and module in its own folder. The behavior and the event names SHALL be those of the chat before the move.

#### Scenario: Remove a feature
- **WHEN** `search-messages` is not mounted
- **THEN** the rooms, the history and the incoming messages still work

### Requirement: What crosses two entities is a feature
`message` SHALL own the event `messageReceived`, and SHALL NOT listen to `roomSelected`. `show-history` SHALL emit `loadHistory` when `roomSelected` is heard. `receive-messages` SHALL emit `messageReceived`. `search-messages` SHALL import `roomSelected` from `room` and `loadHistory` and `markMessage` from `message`.

#### Scenario: Selecting a room loads its history
- **WHEN** a reader selects a room
- **THEN** its history loads, as before, started by `show-history` and not by `message`

#### Scenario: A new message arrives
- **WHEN** `receive-messages` emits `messageReceived` for the open room
- **THEN** the message appears in the list, added by the module of `message`

### Requirement: The pokédex is split into two entities and one feature
The pokédex SHALL have the entities `pokemon` and `ability` and the feature `show-abilities`. `ability` SHALL bind a command `clearAbilities` that empties its state, and `show-abilities` SHALL emit it when a search starts and SHALL emit `loadAbilities` with the abilities of a found pokémon, so no feature writes the store of an entity. The behavior and the event names SHALL be those of the pokédex before the move.

#### Scenario: A new search empties the abilities
- **WHEN** a reader starts a search while abilities are shown
- **THEN** the abilities disappear, and the abilities of the found pokémon load after it
