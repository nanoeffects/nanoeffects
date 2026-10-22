## ADDED Requirements

### Requirement: JSX blocks are checked
A fenced block in `jsx` or `tsx` SHALL be type-checked like a `js` or a `ts` block, with JSX syntax allowed: a `jsx` block reports only the stale-name errors of a plain JavaScript block, and a `tsx` block reports every error. Modules of libraries that the project does not install (such as `react`) SHALL be declarable in the stub file, so a block can import them without an error.

#### Scenario: A jsx block with a component
- **WHEN** a `jsx` block renders `<form onSubmit={handleSubmit}>` and imports `useState` from `react`, and the stub file declares the `react` module
- **THEN** the check reports no error for it

#### Scenario: A removed nanoeffects export in a jsx block
- **WHEN** a `jsx` block imports a name that `nanoeffects` no longer exports
- **THEN** the check fails and names the page and the line, as it does for a `js` block

#### Scenario: A module that is not declared
- **WHEN** a `jsx` block imports `some-library`, which is neither installed nor declared in the stub file
- **THEN** the check fails and names the module

### Requirement: A block can name its file
A block whose first line is a comment of the form `// name.js` (or `.jsx`, `.ts`, `.tsx`) SHALL be written under that name, so that another block of the same page can import it as `./name`. A relative import of a name that no block gives SHALL be reported as an unresolved module.

#### Scenario: A block imports a named block
- **WHEN** one block starts with `// helper.js` and exports `greeting`, and a later block imports `greeting` from `./helper`
- **THEN** the check reports no error

#### Scenario: An import of a name that no block gives
- **WHEN** a block imports from `./helper` and no block starts with `// helper.js`
- **THEN** the check fails and names `./helper`
