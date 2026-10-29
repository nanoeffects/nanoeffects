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

### Requirement: There are TypeScript templates for both shapes
The command SHALL offer the templates `vanilla-ts` and `react-ts` in addition to `vanilla` and `react`. `vanilla` SHALL stay the default, and the JavaScript templates SHALL NOT change. A TypeScript template SHALL show the same app as its JavaScript twin, with the same file split (the bus, the events and the handlers in separate files, as in the guide), written in `.ts` and `.tsx` files with a `tsconfig.json`.

#### Scenario: Make a TypeScript template
- **WHEN** the command is run as `create-nanoeffects my-app --template react-ts`
- **THEN** `my-app` holds the files of `react-ts`, with a `.gitignore`, and no question is asked

#### Scenario: The question lists all templates
- **WHEN** the command asks which template to use
- **THEN** the list names `vanilla`, `react`, `vanilla-ts` and `react-ts`

#### Scenario: The default is unchanged
- **WHEN** the command is run without a terminal and without `--template`
- **THEN** it uses `vanilla`

### Requirement: A TypeScript template types the app from its events
In a TypeScript template every event SHALL be made with `createAction<Payload>("name")`, and the types of the handlers and of the component state SHALL come from those events, with no event map and no cast. The template SHALL build with `npm run build`, which SHALL type-check the project before bundling it, and the type check SHALL pass as the template comes out of the command.

#### Scenario: Typed state in React
- **WHEN** `react-ts` calls `useEventState(searchLoaded, [])` and `searchLoaded` is `createAction<string[]>("search/loaded")`
- **THEN** the state has the type `string[]`

#### Scenario: The build type-checks
- **WHEN** a user changes the payload of an event in a way the code does not follow
- **THEN** `npm run build` fails with a type error before the bundle is made

### Requirement: The TypeScript templates are type-checked from the repository
The repository SHALL type-check `vanilla-ts` and `react-ts` against the sources of `nanoeffects` as part of `pnpm verify`, so a change to the public types of a hook, a policy or an action that breaks a starter fails the check.

#### Scenario: A type change breaks a starter
- **WHEN** a change to the types of `useEventState` makes `react-ts` fail to compile
- **THEN** `pnpm verify` fails and names the file of the template
