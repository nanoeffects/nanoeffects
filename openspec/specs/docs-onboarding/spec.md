# docs-onboarding Specification

## Purpose
Keeps the docs readable for a newcomer: first steps in order, an explicit ladder of project levels, and one index of recipes by problem.

## Requirements

### Requirement: A newcomer can find the first steps in order
The README and `docs/README.md` SHALL let a reader who knows nothing about the library answer, in this order and without leaving the first two pages they open: what the library is for and when not to use it; how to install it (package manager commands, supported Node and TypeScript versions, ESM only); how to run a first working example; where the recipe for a given problem is; what to read next. A snippet SHALL define every name it uses, or say that the name comes from the reader's app.

#### Scenario: First example runs
- **WHEN** a reader copies the first snippet of the README after the install command
- **THEN** it runs without a name that is neither defined in the snippet nor marked as the app's own

#### Scenario: Install is answered
- **WHEN** a reader looks for how to install the library and which Node, TypeScript and bundler it needs
- **THEN** the README or the page it links to states the command, the supported versions and that the package is ESM only

### Requirement: The ladder from level A to F is explicit
`docs/README.md` SHALL list the project levels A to F in order, and for each level say what kind of project it is, when the reader can stop, and the first page to read. Each page of `docs/` SHALL state at its top which level it is for and which page to read first when it assumes one.

#### Scenario: A page without a level
- **WHEN** a page of `docs/` does not name its level or its prerequisite page near the top
- **THEN** the review report lists it as a finding until it does

#### Scenario: Stop here
- **WHEN** a reader with a small app reaches the end of level A
- **THEN** the map says that nothing further is needed to use the bus, and names the level to read when the first async race appears

### Requirement: Recipes have one index by problem
`docs/recipes.md` SHALL list recipes by the problem the reader has, ordered from simple to complex, each as a link to the page or section that solves it. The page SHALL NOT repeat the content of those pages and SHALL be listed in `llms.txt` and in both sidebars.

#### Scenario: Find a recipe by symptom
- **WHEN** a reader has "a second click sends a second request"
- **THEN** `docs/recipes.md` links to the page that solves it

#### Scenario: A recipe page is not in the index
- **WHEN** a page of `docs/` is a recipe (it is named for a task, not for an API) and is not linked from `docs/recipes.md`
- **THEN** the review report lists it as a finding until it is linked

### Requirement: The review is recorded
The change SHALL keep a review report listing, for every page, the findings against the newcomer checklist and whether each was fixed or left (with the reason). A finding that needs an API change SHALL be left, not fixed in prose.

#### Scenario: Left finding
- **WHEN** a page cannot be made clear without a new or changed API
- **THEN** the report records it as left with the reason, and the page is not changed to hide the problem
