# docs-site Specification

## Purpose
TBD - created by archiving change docs-site. Update Purpose after archive.

## Requirements

### Requirement: The docs are published as a static site
The project SHALL build a static site from the Markdown pages of `docs/`, with `docs/` as the only source of page content. The site package SHALL live in the workspace under `tools/` and SHALL NOT add a dependency to the root `package.json` or to the published `nanoeffects` package.

#### Scenario: Build from the source pages
- **WHEN** the site build runs
- **THEN** every `docs/*.md` page is a page of the site, and `docs/README.md` is the home page

#### Scenario: The published package is unchanged
- **WHEN** the package is packed
- **THEN** its `files` and dependencies are the same as before the site existed, and `docs/` contains no site configuration

### Requirement: Links that leave docs resolve
A relative link in a page that points outside `docs/` (the README, the CHANGELOG, `examples/`) SHALL resolve to the matching file or directory of the repository on GitHub in the built site, while the page keeps its relative link. A link that cannot be resolved SHALL fail the build.

#### Scenario: Link to an example
- **WHEN** a page links to `../examples/guide.ts`
- **THEN** the built page links to the `examples/guide.ts` file of the repository on GitHub

#### Scenario: Dead link
- **WHEN** a page links to a docs page that does not exist
- **THEN** the build fails and names the page and the link

### Requirement: Navigation follows the project levels
The site SHALL have a sidebar grouped by project level and a local search. Every page of `docs/` SHALL appear in the sidebar exactly once, and the sidebar SHALL name no page that does not exist.

#### Scenario: A new page without a sidebar entry
- **WHEN** a page is added to `docs/` and not to the sidebar
- **THEN** the sidebar test fails and names the page

### Requirement: The site does not weaken the docs checks
`pnpm docs:check` and `pnpm llms:check` SHALL keep their requirements and SHALL NOT read anything from the site package.

#### Scenario: Checks unaffected
- **WHEN** the site package is removed
- **THEN** `pnpm docs:check` and `pnpm llms:check` give the same result

### Requirement: The site is built on review and published on main
CI SHALL build the site on every pull request, and a workflow SHALL publish it to GitHub Pages on a push to `main` that changes `docs/` or the site package.

#### Scenario: Broken page in a pull request
- **WHEN** a pull request adds a page that breaks the site build
- **THEN** the CI site build fails before merge
