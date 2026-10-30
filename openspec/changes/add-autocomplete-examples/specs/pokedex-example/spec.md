## ADDED Requirements

### Requirement: The search starts on a choice or on Enter and keeps the newest answer
Typing SHALL NOT start a search. A search SHALL start when a suggestion is chosen or Enter is pressed, with the chosen name or the typed text. It SHALL wait for quiet (`debounce`), and a newer search SHALL abort the older (`latest`). The search SHALL be a job whose outcomes drive the page: loading while it runs, the card when it succeeds, and a message when it fails.

#### Scenario: Choosing a suggestion
- **WHEN** a reader types `pika` and chooses `pikachu` from the suggestions
- **THEN** one request starts, for `pikachu`, and its card is shown

#### Scenario: A number with Enter
- **WHEN** a reader types `25` and presses Enter
- **THEN** the search runs for `25`

#### Scenario: Two quick choices
- **WHEN** a reader chooses a second suggestion before the first search has finished
- **THEN** the first request is cancelled and only the card of the second is shown

#### Scenario: An unknown name
- **WHEN** a reader presses Enter on a name that PokeAPI does not know
- **THEN** the page says there is no such pokémon, and the request is not tried again

### Requirement: Typing shows suggestions from a name list that is loaded once
The example SHALL load the list of all pokémon names once, when the app starts, with one request that gets the `AbortSignal` of its task and is limited in time (`timeout`) and tried again after a failure that is not an answer (`retry`). Typing SHALL send no request: it SHALL show up to six suggestions filtered in the browser, the names that start with the typed text first and then the names that contain it, ignoring case. An empty or blank text SHALL show none.

#### Scenario: Suggestions while typing
- **WHEN** a reader types `char`
- **THEN** up to six names appear at once, those that start with `char` before those that only contain it, and no request is sent

#### Scenario: The list is loaded once
- **WHEN** a reader types many times
- **THEN** the list of names was requested once

#### Scenario: The list does not load
- **WHEN** the request for the list fails
- **THEN** the page shows a one-line hint that there are no suggestions, and Enter still searches for the typed text

### Requirement: The suggestions can be used from the keyboard
The input SHALL be a combobox with a listbox of the suggestions. The arrow keys SHALL move the highlighted suggestion, Enter SHALL choose it (or search for the typed text when none is highlighted), Escape SHALL close the suggestions, and a click on a suggestion SHALL choose it. Choosing or pressing Escape SHALL leave the suggestions empty.

#### Scenario: Arrows and Enter
- **WHEN** a reader types `pi`, presses the down arrow twice and Enter
- **THEN** the second suggestion is searched for

#### Scenario: Escape
- **WHEN** a reader presses Escape while suggestions are shown
- **THEN** the suggestions close and the typed text stays

## REMOVED Requirements

### Requirement: Search waits for quiet and keeps the newest answer
**Reason**: Typing no longer starts the search; partial names answered 404 while the reader was still typing. The search now starts on a choice or on Enter, and keeps the same waiting and replacing.
**Migration**: See "The search starts on a choice or on Enter and keeps the newest answer".
