## MODIFIED Requirements

### Requirement: Missing choices are asked in a terminal
When the directory name or the template is not given and the input is a terminal, the command SHALL ask for it and offer the known templates. When it is not a terminal, the command SHALL NOT wait for input: it SHALL use the default template and fail with a message that names the missing directory name.

#### Scenario: Ask for the template
- **WHEN** the command is run in a terminal with a name and no `--template`
- **THEN** it asks which template to use and lists every known template, `domains-ts` among them

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
- **THEN** it exits with a non-zero code and lists every known template, `domains-ts` among them
