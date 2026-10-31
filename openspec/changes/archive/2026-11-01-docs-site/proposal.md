## Why

The user documentation is 35 Markdown pages in `docs/`, readable only on GitHub or in the npm package. There is no search, no sidebar and no stable URL for a page, which raises the cost of onboarding that the Documentation section of AGENTS.md exists to lower. Libraries of this kind (Effector, Redux, Zustand, Vite) publish a static docs site; GitBook is not what they use.

## What Changes

- Add a static docs site built with VitePress from the existing `docs/*.md`. The Markdown stays the single source: no copy, no second set of pages.
- Add a workspace package `tools/docs-site` (config, theme tweaks, sidebar, build script). It holds the site's dependencies, so the root `package.json` and the published `nanoeffects` package gain none.
- Map `docs/README.md` to the site index, and resolve the links that leave `docs/` (`../README.md`, `../CHANGELOG.md`, `../examples/...`) to GitHub URLs at build time, without editing the pages.
- Build the sidebar from the project levels (A to F) of the Documentation section, with local search.
- Add a CI job that builds the site, and a workflow that publishes it to GitHub Pages on a push to `main`.
- Link the site from the README and `package.json` `homepage`; `llms.txt` stays the index for AI assistants.
- Out of scope: any change to `src/`, bundle sizes, the content of the pages, versioned docs, translations, a custom domain.

## Capabilities

### New Capabilities
- `docs-site`: the built site, its source (`docs/`), link resolution, navigation, search and publishing.

### Modified Capabilities
<!-- None: docs-snippet-check and llm-docs keep their requirements; the site must not break them (stated as a scenario in docs-site). -->

## Impact

- New: `tools/docs-site/`, `.github/workflows/docs.yml`, a `docs:site` build step in CI.
- Changed: `README.md` (one link), `package.json` (`homepage`, a `docs:site:build` script), `pnpm-lock.yaml`, `CHANGELOG.md` is not needed (no change for library users).
- `pnpm docs:check`, `pnpm llms:check` and the published `files` list are unchanged.
- Assumption: the site is served from `https://nanoeffects.github.io/nanoeffects/` (GitHub Pages of the repository), so the base path is `/nanoeffects/`.
