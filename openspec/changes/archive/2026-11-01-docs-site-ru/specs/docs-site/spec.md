## MODIFIED Requirements

### Requirement: Navigation follows the project levels
The site SHALL have, for each locale, a sidebar grouped by project level and a local search. Every page of `docs/` SHALL appear in the English sidebar exactly once, every page of `docs/ru/` SHALL appear in the Russian sidebar exactly once, and a sidebar SHALL name no page that does not exist.

#### Scenario: A new page without a sidebar entry
- **WHEN** a page is added to `docs/` and not to the sidebar
- **THEN** the sidebar test fails and names the page

#### Scenario: A new Russian page without a sidebar entry
- **WHEN** a page is added to `docs/ru/` and not to the Russian sidebar
- **THEN** the sidebar test fails and names the page

## ADDED Requirements

### Requirement: Policies and effects are listed as short links
The sidebar SHALL group pages by the reader's job, with frameworks together and libraries and stores together, and SHALL list each policy and each effect as a short nested link under its page. A nested link SHALL point at a heading that exists on that page.

#### Scenario: Frameworks are grouped
- **WHEN** a reader opens the sidebar
- **THEN** the React, Vue and Svelte pages are in one group, and the Redux, Zustand, MobX, Pinia and query-library pages are in another

#### Scenario: A nested link to a missing heading
- **WHEN** a nested sidebar link points at an anchor that is not a heading of its page
- **THEN** the sidebar test fails and names the link

#### Scenario: A policy in the list
- **WHEN** a reader opens the Policies group
- **THEN** `latest`, `leading`, `debounce`, `throttle`, `queue` and `key` are listed as links to their headings
