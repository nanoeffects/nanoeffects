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
The command SHALL offer the templates `vanilla-ts` and `react-ts` in addition to `vanilla` and `react`. `vanilla` SHALL stay the default, and the JavaScript templates SHALL NOT change. A TypeScript template SHALL show the same app as its JavaScript twin, with the same file split (the bus, the events and the handlers in separate files, as in the guide), written in `.ts` and `.tsx` files with a `tsconfig.json`. The templates `domains-ts` and `vue-ts` have no JavaScript twin and follow their own requirements.

#### Scenario: Make a TypeScript template
- **WHEN** the command is run as `create-nanoeffects my-app --template react-ts`
- **THEN** `my-app` holds the files of `react-ts`, with a `.gitignore`, and no question is asked

#### Scenario: The question lists all templates
- **WHEN** the command asks which template to use
- **THEN** the list names `vanilla`, `react`, `vanilla-ts`, `react-ts`, `domains-ts` and `vue-ts`

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
The repository SHALL type-check `vanilla-ts`, `react-ts`, `domains-ts` and `vue-ts` against the sources of `nanoeffects` as part of `pnpm verify`, so a change to the public types of a hook, a policy, an action, a job or a module that breaks a starter fails the check. The check of `vue-ts` SHALL read its `.vue` file too, not only its `.ts` files.

#### Scenario: A type change breaks a starter
- **WHEN** a change to the types of `useEventState` makes `react-ts` fail to compile
- **THEN** `pnpm verify` fails and names the file of the template

#### Scenario: A type change breaks the domains template
- **WHEN** a change to the types of `createJob` makes `domains-ts` fail to compile
- **THEN** `pnpm verify` fails and names the file of the template

#### Scenario: A type error in the Vue component
- **WHEN** the `.vue` file of `vue-ts` passes a value of the wrong type to a `nanoeffects` call
- **THEN** `pnpm verify` fails and names `App.vue`

### Requirement: The domains-ts template shows logic split by domain
The command SHALL offer the template `domains-ts`: a TypeScript project with a thin React layer in which the logic lives in domain folders. Each domain folder SHALL have an events file (made with `createAction<Payload>`, `createCommand` and `createJob`), a handlers file, and a module made with `createModule` that mounts the handlers. The bus file SHALL hold only the bus and its plugins, and SHALL NOT import events. An events file SHALL NOT import the bus.

#### Scenario: Make the template
- **WHEN** the command is run as `create-nanoeffects my-app --template domains-ts`
- **THEN** `my-app` holds the files of `domains-ts`, with a `.gitignore`, and no question is asked

#### Scenario: Layout of a domain
- **WHEN** a project is made from `domains-ts`
- **THEN** each folder under `src/domains/` has an events file, a handlers file and a module file
- **AND** `src/bus.ts` imports no event and no events file imports the bus

### Requirement: The domains-ts template drives the UI from a job
The template SHALL have one domain whose work is a job (`createJob`) under a policy, and the UI SHALL show its state (running, done, failed) from the outcomes `pending`, `success`, `fail` and `cancel` of that job through a store of the domain, not by setting flags in the handler. A component SHALL NOT call the fake server directly.

#### Scenario: A job drives the status
- **WHEN** the user starts the job and the fake server fails
- **THEN** the UI shows the failed state from the `fail` outcome, and a later success clears it

#### Scenario: A second start is dropped
- **WHEN** the user starts the job again while it runs
- **THEN** the policy drops the second call and the status of the first run is not cleared

### Requirement: The domains-ts template says that useEventState is not a store
Where the template reads an event into React state with `useEventState`, a comment SHALL say that the state is not a global store, that an event emitted before the mount is lost, and that a value which must outlive the component belongs in a store or a provider at the root.

#### Scenario: The comment is present
- **WHEN** a project is made from `domains-ts`
- **THEN** the file that calls `useEventState` has that comment next to the call

### Requirement: The vue-ts template shows the bus in a Vue app
The command SHALL offer the template `vue-ts`: a Vite, Vue 3 and TypeScript project with `<script setup lang="ts">` that is the search app of `react-ts`. It SHALL keep the bus, the events and the handlers in separate files, as the other templates do, with the events made by `createAction<Payload>`. The component SHALL read the result of the search from a `ref` through a composable that is part of the template, not from a `nanoeffects` entry, and SHALL unsubscribe when the component unmounts.

#### Scenario: Make the template
- **WHEN** the command is run as `create-nanoeffects my-app --template vue-ts`
- **THEN** `my-app` holds the files of `vue-ts`, with a `.gitignore`, and no question is asked

#### Scenario: Unmount removes the listener
- **WHEN** the component that uses the composable unmounts
- **THEN** the bus no longer has its listener and a later event does not change the `ref`

#### Scenario: Nothing is emitted on mount
- **WHEN** the component mounts
- **THEN** no `queryChanged` event is emitted until the user types

### Requirement: The vue-ts composable says that it is not a store
The composable SHALL carry a comment that says that the `ref` is state of one component and not a global store, that an event emitted before the mount is lost, and where a value that must outlive the component belongs.

#### Scenario: The comment is present
- **WHEN** a project is made from `vue-ts`
- **THEN** the file of the composable has that comment
