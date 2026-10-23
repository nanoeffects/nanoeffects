## MODIFIED Requirements

### Requirement: The playground has a React variant
The repository SHALL contain a second StackBlitz project, built from `examples/playground-react/`, that runs the same search flow as the DOM playground inside a React component. `examples/README.md` SHALL link to it next to the DOM playground; the main README SHALL NOT carry a second playground link or a second demo block.

#### Scenario: A reader opens the React link
- **WHEN** a reader opens the React playground link from `examples/README.md`
- **THEN** a running page appears that uses `nanoeffects` from npm and React

#### Scenario: Fast typing sends one request
- **WHEN** a reader types "nano" quickly in the React playground
- **THEN** only one search request starts, for "nano", after the quiet time

#### Scenario: A newer query aborts a slow one
- **WHEN** a reader types a query, waits for its request to start, and then types another
- **THEN** the first request is shown as aborted and only the second result is shown

#### Scenario: The README stays short
- **WHEN** the README is read from top to bottom
- **THEN** it has one playground link (the DOM one) and one link to the examples index
