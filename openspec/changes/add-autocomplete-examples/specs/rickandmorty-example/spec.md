## ADDED Requirements

### Requirement: The name box suggests names from a command outside React Query
The name input SHALL show up to five character names that match the typed text. They SHALL come from a nanoeffects command `suggestCharacters` that carries its handler, waits for quiet (`debounce`, 250 ms), keeps only the newest request (`latest`) and limits the time (`timeout`), and SHALL NOT be tried again after a failure. React Query SHALL keep the pages and the episodes only; the suggestions SHALL be state of the component.

#### Scenario: Fast typing sends one request
- **WHEN** a reader types `mor` quickly
- **THEN** one request for suggestions starts after the quiet time, and a newer one cancels the older in the browser


### Requirement: No match and blank text are not errors
A 404 from the name request SHALL mean no match and give an empty list, with no error shown. An empty or blank text SHALL clear the suggestions and send no request.

#### Scenario: No match
- **WHEN** the typed text matches no character
- **THEN** the suggestions are empty and the page shows no error

#### Scenario: Blank text
- **WHEN** a reader clears the box
- **THEN** the suggestions disappear and no request is sent

### Requirement: Choosing a suggestion runs the existing search
The input SHALL be a combobox with a listbox of the suggestions. The arrow keys SHALL move the highlight, Enter SHALL choose the highlighted suggestion (or submit the typed text when none is highlighted), Escape SHALL close the list, and a click SHALL choose a suggestion. Choosing SHALL fill the input and set the same filter as the form does, so the existing query runs. Submitting the form with Enter or the Search button SHALL work as before.

#### Scenario: Pick with the keyboard
- **WHEN** a reader types `mor`, presses the down arrow and Enter
- **THEN** the input holds the first suggestion and the list of characters is searched for that name

#### Scenario: Submit without a suggestion
- **WHEN** a reader types a name and presses Enter with no suggestion highlighted
- **THEN** the form submits and searches for the typed text
