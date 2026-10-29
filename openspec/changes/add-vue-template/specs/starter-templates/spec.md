## ADDED Requirements

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

## MODIFIED Requirements

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
