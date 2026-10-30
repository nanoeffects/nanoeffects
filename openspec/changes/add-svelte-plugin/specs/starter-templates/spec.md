## MODIFIED Requirements

### Requirement: The svelte-ts template shows the bus in a Svelte app
The command SHALL offer the template `svelte-ts`: a Vite, Svelte 5 and TypeScript project that is the search app of `react-ts`. It SHALL keep the bus, the events and the handlers in separate files, with the events made by `createAction<Payload>`, and SHALL use `sveltePlugin` from `nanoeffects/svelte` in its bus file. It SHALL NOT carry a helper file of its own that makes a store from an event.

#### Scenario: Make the template
- **WHEN** the command is run as `create-nanoeffects my-app --template svelte-ts`
- **THEN** `my-app` holds the files of `svelte-ts`, with a `.gitignore`, and no question is asked

#### Scenario: The bus uses the plugin
- **WHEN** a project is made from `svelte-ts`
- **THEN** its `bus.ts` uses `sveltePlugin()` and the project has no `event-store.ts`

### Requirement: The svelte-ts component talks to the bus through events and a store
The component SHALL emit the query from the handler of the input event, so nothing is emitted on mount, and SHALL show the result of the search through the store that `eventStore` of the bus makes from the event, so that Svelte stops the subscription when the component is destroyed.

#### Scenario: Nothing is emitted on mount
- **WHEN** the component mounts
- **THEN** no `queryChanged` event is emitted until the user types

#### Scenario: The store listens only while it is used
- **WHEN** no component reads the store of the event
- **THEN** the bus has no listener of that store, and it has one while a component reads it

### Requirement: The svelte-ts template says that the store is not a store of the app
The component that calls `eventStore` SHALL carry a comment that says that the store keeps the last payload while something reads it, that an event emitted before that is lost, and where a value that must outlive the component belongs.

#### Scenario: The comment is present
- **WHEN** a project is made from `svelte-ts`
- **THEN** the file that calls `eventStore` has that comment next to the call
