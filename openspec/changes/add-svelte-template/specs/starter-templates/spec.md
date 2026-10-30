## ADDED Requirements

### Requirement: The svelte-ts template shows the bus in a Svelte app
The command SHALL offer the template `svelte-ts`: a Vite, Svelte 5 and TypeScript project that is the search app of `react-ts`. It SHALL keep the bus, the events and the handlers in separate files, with the events made by `createAction<Payload>`, and SHALL add no `nanoeffects` entry for Svelte.

#### Scenario: Make the template
- **WHEN** the command is run as `create-nanoeffects my-app --template svelte-ts`
- **THEN** `my-app` holds the files of `svelte-ts`, with a `.gitignore`, and no question is asked

### Requirement: The svelte-ts component talks to the bus through events and a store
The component SHALL emit the query from the handler of the input event, so nothing is emitted on mount, and SHALL show the result of the search through a Svelte store that a helper of the project makes from the event, so that Svelte stops the subscription when the component is destroyed.

#### Scenario: Nothing is emitted on mount
- **WHEN** the component mounts
- **THEN** no `queryChanged` event is emitted until the user types

#### Scenario: The store listens only while it is used
- **WHEN** no component reads the store of the event
- **THEN** the bus has no listener of that store, and it has one while a component reads it

### Requirement: The svelte-ts template says that the store is not a store of the app
The helper of the project that makes a store from an event, and the component that uses it, SHALL carry a comment that says that the store keeps the last payload while something reads it, that an event emitted before that is lost, and where a value that must outlive the component belongs.

#### Scenario: The comment is present
- **WHEN** a project is made from `svelte-ts`
- **THEN** the file of the helper has that comment

## MODIFIED Requirements

### Requirement: There are TypeScript templates for both shapes
The command SHALL offer the templates `vanilla-ts` and `react-ts` in addition to `vanilla` and `react`. `vanilla` SHALL stay the default, and the JavaScript templates SHALL NOT change. A TypeScript template SHALL show the same app as its JavaScript twin, with the same file split (the bus, the events and the handlers in separate files, as in the guide), written in `.ts` and `.tsx` files with a `tsconfig.json`. The templates `domains-ts`, `vue-ts` and `svelte-ts` have no JavaScript twin and follow their own requirements.

#### Scenario: Make a TypeScript template
- **WHEN** the command is run as `create-nanoeffects my-app --template react-ts`
- **THEN** `my-app` holds the files of `react-ts`, with a `.gitignore`, and no question is asked

#### Scenario: The question lists all templates
- **WHEN** the command asks which template to use
- **THEN** the list names `vanilla`, `react`, `vanilla-ts`, `react-ts`, `domains-ts`, `vue-ts` and `svelte-ts`

#### Scenario: The default is unchanged
- **WHEN** the command is run without a terminal and without `--template`
- **THEN** it uses `vanilla`

### Requirement: The TypeScript templates are type-checked from the repository
The repository SHALL type-check `vanilla-ts`, `react-ts`, `domains-ts`, `vue-ts` and `svelte-ts` against the sources of `nanoeffects` as part of `pnpm verify`, so a change to the public types of a hook, a policy, an action, a job or a module that breaks a starter fails the check. The check of `vue-ts` SHALL read its `.vue` file and the check of `svelte-ts` its `.svelte` files, not only their `.ts` files.

#### Scenario: A type change breaks a starter
- **WHEN** a change to the types of `useEventState` makes `react-ts` fail to compile
- **THEN** `pnpm verify` fails and names the file of the template

#### Scenario: A type change breaks the domains template
- **WHEN** a change to the types of `createJob` makes `domains-ts` fail to compile
- **THEN** `pnpm verify` fails and names the file of the template

#### Scenario: A type error in the Vue component
- **WHEN** the `.vue` file of `vue-ts` passes a value of the wrong type to a `nanoeffects` call
- **THEN** `pnpm verify` fails and names `App.vue`

#### Scenario: A type error in the Svelte component
- **WHEN** a `.svelte` file of `svelte-ts` passes a value of the wrong type to a `nanoeffects` call
- **THEN** `pnpm verify` fails and names that file
