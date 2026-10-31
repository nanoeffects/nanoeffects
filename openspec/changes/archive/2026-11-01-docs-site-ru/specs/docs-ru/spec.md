## ADDED Requirements

### Requirement: Every docs page has a Russian page
For every page `docs/<name>.md` there SHALL be a page `docs/ru/<name>.md` (the home page `docs/README.md` has `docs/ru/README.md`). The Russian page SHALL translate prose, headings, table text and snippet comments, and SHALL keep API names, identifiers, code and file names unchanged.

#### Scenario: A page without a translation
- **WHEN** `docs/<name>.md` exists and `docs/ru/<name>.md` does not
- **THEN** the docs check fails and names the page

#### Scenario: A Russian page without an English one
- **WHEN** `docs/ru/<name>.md` exists and `docs/<name>.md` does not
- **THEN** the docs check fails and names the page

### Requirement: Russian code matches the English code
The code blocks of a Russian page SHALL be the same in number and fence language as those of the English page, and each SHALL equal the English block at the same position once line comments and block comments are removed. The Russian blocks SHALL be type-checked as the English ones are.

#### Scenario: A changed line of code
- **WHEN** a Russian block differs from the English block in a line that is not a comment
- **THEN** the check fails and names both files and the block index

#### Scenario: A translated comment
- **WHEN** a Russian block differs from the English one only in its comments
- **THEN** the check reports no parity error

#### Scenario: A stale name in a Russian block
- **WHEN** a Russian block imports a name that `nanoeffects` no longer exports
- **THEN** the check fails and names the Russian page, the line of the fence and the TypeScript error

### Requirement: The Russian docs are a locale of the site
The site SHALL serve the Russian pages under `/ru/` with a language switcher, a Russian sidebar and search, and SHALL keep the English pages at the root. The AI-facing files `llms.txt` and `llms-full.txt` SHALL stay English and SHALL NOT list `docs/ru/`.

#### Scenario: Switch the language
- **WHEN** a reader opens a page and selects Russian
- **THEN** the Russian page of the same name opens

#### Scenario: llms check ignores Russian pages
- **WHEN** `docs/ru/` is added
- **THEN** `pnpm llms:check` gives the same result as before
