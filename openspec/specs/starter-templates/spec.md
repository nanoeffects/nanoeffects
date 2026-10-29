# starter-templates Specification

## Purpose
A template is a small project that works as it comes out of the command: it installs, builds and runs against the published `nanoeffects`, and shows the file layout the docs teach.

## Requirements

### Requirement: A template is a working project
Each template SHALL install its dependencies, build with its `build` script and start with its `dev` script, with no change by the user. The `vanilla` template SHALL show a bus and one handler under the `latest` policy; the `react` template SHALL show `useEmitter` and `usePolicy`.

#### Scenario: Build a scaffolded template
- **WHEN** a project is made from a template and its dependencies are installed
- **THEN** `build` succeeds and the built page runs the handler

### Requirement: Templates use the file layout of the docs
A template SHALL keep the bus in its own file, the events in a file named after the domain, and the handlers in a third file. The bus file SHALL NOT import events, and the events file SHALL NOT import the bus. Each call of the nanoeffects API SHALL have a comment that says what it does there.

#### Scenario: Layout of the vanilla template
- **WHEN** a project is made from `vanilla`
- **THEN** it has `src/bus.js`, `src/search.js` and `src/search-handlers.js`
- **AND** `src/bus.js` imports no event and `src/search.js` imports no bus

### Requirement: Templates are checked against the packed packages
The repository tests SHALL scaffold every template from the packed `create-nanoeffects` and the packed `nanoeffects`, install, and build it, so a template cannot depend on a name that the library does not export.

#### Scenario: A template uses a removed name
- **WHEN** a template imports a name that `nanoeffects` no longer exports
- **THEN** the integration test for that template fails
