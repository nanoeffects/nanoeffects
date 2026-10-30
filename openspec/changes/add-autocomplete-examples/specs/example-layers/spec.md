## RENAMED Requirements

- FROM: `### Requirement: The pokédex is split into two entities and one feature`
- TO: `### Requirement: The pokédex is split into three entities and two features`

## MODIFIED Requirements

### Requirement: The pokédex is split into three entities and two features
The pokédex SHALL have the entities `pokemon`, `ability` and `pokemon-index` and the features `show-abilities` and `suggest-pokemon`. `ability` SHALL bind a command `clearAbilities` that empties its state, and `show-abilities` SHALL emit it when a search starts and SHALL emit `loadAbilities` with the abilities of a found pokémon, so no feature writes the store of an entity. `pokemon-index` SHALL own the list of names, and `suggest-pokemon` SHALL read it and SHALL bind a command `clearSuggestions` for the components. The behavior and the event names of the search and of the abilities SHALL be those of the pokédex before the move.

#### Scenario: A new search empties the abilities
- **WHEN** a reader starts a search while abilities are shown
- **THEN** the abilities disappear, and the abilities of the found pokémon load after it
