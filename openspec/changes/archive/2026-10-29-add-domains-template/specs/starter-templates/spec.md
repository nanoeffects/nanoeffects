## ADDED Requirements

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

## MODIFIED Requirements

### Requirement: There are TypeScript templates for both shapes
The command SHALL offer the templates `vanilla-ts` and `react-ts` in addition to `vanilla` and `react`. `vanilla` SHALL stay the default, and the JavaScript templates SHALL NOT change. A TypeScript template SHALL show the same app as its JavaScript twin, with the same file split (the bus, the events and the handlers in separate files, as in the guide), written in `.ts` and `.tsx` files with a `tsconfig.json`. The template `domains-ts` has no JavaScript twin and follows its own requirements.

#### Scenario: Make a TypeScript template
- **WHEN** the command is run as `create-nanoeffects my-app --template react-ts`
- **THEN** `my-app` holds the files of `react-ts`, with a `.gitignore`, and no question is asked

#### Scenario: The question lists all templates
- **WHEN** the command asks which template to use
- **THEN** the list names `vanilla`, `react`, `vanilla-ts`, `react-ts` and `domains-ts`

#### Scenario: The default is unchanged
- **WHEN** the command is run without a terminal and without `--template`
- **THEN** it uses `vanilla`

### Requirement: The TypeScript templates are type-checked from the repository
The repository SHALL type-check `vanilla-ts`, `react-ts` and `domains-ts` against the sources of `nanoeffects` as part of `pnpm verify`, so a change to the public types of a hook, a policy, an action, a job or a module that breaks a starter fails the check.

#### Scenario: A type change breaks a starter
- **WHEN** a change to the types of `useEventState` makes `react-ts` fail to compile
- **THEN** `pnpm verify` fails and names the file of the template

#### Scenario: A type change breaks the domains template
- **WHEN** a change to the types of `createJob` makes `domains-ts` fail to compile
- **THEN** `pnpm verify` fails and names the file of the template
