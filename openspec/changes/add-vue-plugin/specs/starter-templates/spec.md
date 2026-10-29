## MODIFIED Requirements

### Requirement: The vue-ts template shows the bus in a Vue app
The command SHALL offer the template `vue-ts`: a Vite, Vue 3 and TypeScript project with `<script setup lang="ts">` that is the search app of `react-ts`. It SHALL keep the bus, the events and the handlers in separate files, as the other templates do, with the events made by `createAction<Payload>`. The bus file SHALL add `vuePlugin()` from `nanoeffects/vue`. The component SHALL read the result of the search from a `ref` made by `useEventRef`, and SHALL emit the query with `watchEmitter`. The template SHALL NOT carry a helper of its own for either.

#### Scenario: Make the template
- **WHEN** the command is run as `create-nanoeffects my-app --template vue-ts`
- **THEN** `my-app` holds the files of `vue-ts`, with a `.gitignore`, and no question is asked

#### Scenario: Unmount removes the listener
- **WHEN** the component that uses `useEventRef` unmounts
- **THEN** the bus no longer has its listener and a later event does not change the `ref`

#### Scenario: Nothing is emitted on mount
- **WHEN** the component mounts
- **THEN** no `queryChanged` event is emitted until the user types

### Requirement: The vue-ts composable says that it is not a store
The component that calls `useEventRef` SHALL carry a comment that says that the `ref` is state of one component and not a global store, that an event emitted before the mount is lost, and where a value that must outlive the component belongs.

#### Scenario: The comment is present
- **WHEN** a project is made from `vue-ts`
- **THEN** the file that calls `useEventRef` has that comment next to the call
