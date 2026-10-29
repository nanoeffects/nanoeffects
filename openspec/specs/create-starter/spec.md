# create-starter Specification

## Purpose
The `create-nanoeffects` command makes a new project from a template with one call, so a reader can run the bus before reading any page of the docs.

## Requirements

### Requirement: The command is reachable through `npm create`
The package `create-nanoeffects` SHALL provide a `create-nanoeffects` executable, so `npm create nanoeffects`, `pnpm create nanoeffects`, `yarn create nanoeffects` and `bun create nanoeffects` run it. The executable SHALL need no dependency and run on Node 18 or newer.

#### Scenario: Run with npm
- **WHEN** a user runs `npm create nanoeffects@latest my-app`
- **THEN** the command runs and makes the directory `my-app`

### Requirement: The command copies a template into a new directory
Given a directory name and a template, the command SHALL copy the files of that template into the directory, creating it when it is missing. A file named `_gitignore` in a template SHALL be written as `.gitignore`.

#### Scenario: Scaffold with arguments
- **WHEN** the command is run as `create-nanoeffects my-app --template vanilla`
- **THEN** `my-app` holds the files of the `vanilla` template, with a `.gitignore`
- **AND** the command asks no question

#### Scenario: Project name in the package
- **WHEN** a project is made in the directory `my-app`
- **THEN** the `name` in its `package.json` is `my-app`

### Requirement: The project uses the version of nanoeffects that came with the command
The command SHALL write into the `package.json` of the new project a dependency range on `nanoeffects` that includes the version of the command itself, and no other version.

#### Scenario: Version follows the command
- **WHEN** the command is version `0.17.0`
- **THEN** the new project depends on `nanoeffects` with a range that accepts `0.17.0`

### Requirement: Missing choices are asked in a terminal
When the directory name or the template is not given and the input is a terminal, the command SHALL ask for it and offer the known templates. When it is not a terminal, the command SHALL NOT wait for input: it SHALL use the default template and fail with a message that names the missing directory name.

#### Scenario: Ask for the template
- **WHEN** the command is run in a terminal with a name and no `--template`
- **THEN** it asks which template to use and lists `vanilla` and `react`

#### Scenario: No terminal and no name
- **WHEN** the command is run with no terminal and no directory name
- **THEN** it exits with a non-zero code and a message that asks for a directory name

### Requirement: The command does not overwrite files
The command SHALL refuse to write into a directory that exists and is not empty, and SHALL leave it unchanged. It SHALL refuse an unknown template and name the known ones.

#### Scenario: Directory has files
- **WHEN** `my-app` exists and has a file
- **THEN** the command exits with a non-zero code and changes nothing

#### Scenario: Unknown template
- **WHEN** the command is run with `--template angular`
- **THEN** it exits with a non-zero code and lists `vanilla` and `react`

### Requirement: The command tells the next steps
After a successful run the command SHALL print the commands to enter the directory, install, and start the dev server, written for the package manager that ran it.

#### Scenario: pnpm
- **WHEN** the command is run by `pnpm create`
- **THEN** the printed steps use `pnpm install` and `pnpm dev`

### Requirement: The package is released with nanoeffects
`create-nanoeffects` SHALL have the same version as `nanoeffects`. The release workflow SHALL fail when the tag, the version of either package, or the changelog disagree, and SHALL publish `nanoeffects` before `create-nanoeffects`.

#### Scenario: Versions differ
- **WHEN** a tag `v0.17.0` is pushed and `create-nanoeffects` is version `0.16.0`
- **THEN** the release workflow fails before it publishes anything
