## MODIFIED Requirements

### Requirement: The domains-ts template shows logic split by domain
The command SHALL offer the template `domains-ts`: a TypeScript project with a thin React layer in which the logic lives in domain folders. Each domain folder SHALL have an events file (made with `createAction<Payload>`, `createAction` with a `handle`, and `createJob`), a handlers file, and a module made with `createModule` that mounts the handlers. The bus file SHALL hold only the bus and its plugins, and SHALL NOT import events. An events file SHALL NOT import the bus.

#### Scenario: Make the template
- **WHEN** the command is run as `create-nanoeffects my-app --template domains-ts`
- **THEN** `my-app` holds the files of `domains-ts`, with a `.gitignore`, and no question is asked

#### Scenario: Layout of a domain
- **WHEN** a project is made from `domains-ts`
- **THEN** each folder under `src/domains/` has an events file, a handlers file and a module file
- **AND** `src/bus.ts` imports no event and no events file imports the bus
