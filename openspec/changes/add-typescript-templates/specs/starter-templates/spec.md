## ADDED Requirements

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
