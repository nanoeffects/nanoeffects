# Design

## Context

`npm create nanoeffects` runs the package named `create-nanoeffects`, so the starter cannot live inside `nanoeffects` (its `files` and size limits are for the library). The repository is one package today; `pnpm-workspace.yaml` exists but only holds `allowBuilds`. The release workflow publishes on a `v*` tag after checking the tag against the root `package.json` and `CHANGELOG.md`. Root `tsconfig` includes only `src`, `examples`, `integration`, and the `check` script names its folders, so a new top-level folder is outside both by default. `integration/bundlers.test.ts` already packs the library and builds with Vite and webpack; the starter test reuses that approach.

## Goals / Non-Goals

**Goals:**
- One command from nothing to a running bus, for the level A/B reader.
- Templates cannot drift from the library: CI builds them against the packed packages.
- No new moving parts for a release: one tag, one changelog.

**Non-Goals:**
- TypeScript templates, more frameworks (Vue, Svelte), Redux or Zustand templates. Each is a new folder in `templates/` and can come later without a spec change.
- A build step, a bundler or any runtime dependency for the CLI.
- Prompt libraries, `--git`, `--install`, `--yes` flags. "Complicating can be done later."

## Decisions

**Same repository, `packages/create-nanoeffects/`, workspace `packages: ["packages/*"]`.** Templates live next to the code they teach and are built by CI on every change. Alternative: a separate repository like `create-vite`'s own. Rejected: it would drift, and `docs/` would have to be synced by hand. The workspace entry matches only direct children of `packages/`, so the `package.json` files inside `templates/` are not workspace members. The CLI has no dependencies, so the lockfile barely changes.

**Plain JavaScript, no build.** `packages/create-nanoeffects/index.js` is published as it is, with `node:fs`, `node:path`, `node:readline/promises` and `node:url` only. Alternative: TypeScript through `tsdown`. Rejected: one file of about 120 lines does not pay for a second build. Biome checks it (`check` gets `./packages`, with the templates ignored).

**Templates are copied, with two substitutions.** `name` in `package.json` becomes the directory name; the `nanoeffects` range becomes `^<version of the CLI>`. A placeholder in the template (`"nanoeffects": "{{version}}"`, `"name": "{{name}}"`) is replaced in `package.json` only, after parsing and before writing, so the other files are copied byte for byte. `_gitignore` is renamed to `.gitignore` because npm drops `.gitignore` from a package. Alternative: generate files from code. Rejected: a template must be readable and diffable as the project it makes.

**The version of the CLI is the version of the library.** Same number, same tag. The scaffolded range is the CLI's own version, so a project never gets an API the CLI did not ship with. The release workflow checks both `package.json` files against the tag and publishes `nanoeffects` first, then `create-nanoeffects`, so the range always resolves on npm. A failure between the two publishes leaves the library out and the CLI not; a re-run of the second publish step is safe. Alternative: independent versions. Rejected: two numbers to keep in step for no gain.

**Prompts without a library.** When `process.stdin.isTTY` and a value is missing, ask with `readline/promises`; otherwise use the defaults and fail only for the missing directory name. Template choice defaults to `vanilla`. The next-steps message reads `npm_config_user_agent` to name `npm`, `pnpm`, `yarn` or `bun`.

**Templates: JS, Vite, the layout of the docs.** `vanilla` has `index.html`, `src/bus.js`, `src/search.js` (events), `src/search-handlers.js` and `src/main.js`; `react` replaces `main.js` with `main.jsx` and `App.jsx` and uses `@vitejs/plugin-react`. Every nanoeffects call has a comment, as the docs rule asks. They follow `docs/guide.md` and `docs/react.md`, which `docs:check` already keeps true; the templates are checked by the integration test, not by `docs:check`.

**Integration test builds from tarballs.** `integration/starter.test.ts` runs `npm pack` for both packages, scaffolds each template into a temp directory with the packed CLI, installs with the packed `nanoeffects` as an override, runs `vite build`, and loads the output the way `bundlers.test.ts` does. It needs network for `vite` and `react` like that test does.

**Exclusions.** `biome.json` ignores `packages/*/templates` (they follow starter conventions and carry placeholders). The root `tsconfig` is untouched (`packages` is not in `include`). `lint:package` also runs `publint` on the CLI package.

## Risks / Trade-offs

- [`nanoeffects` is published, the CLI publish fails] → the library release stands; re-run the failed step of the workflow. Documented in `AGENTS.md`.
- [A new `vite` or `react` major breaks a template] → ranges are caret; the integration test fails on CI first. Renovate-style bumps are out of scope.
- [npm trusted publishing is per package] → the owner adds `create-nanoeffects` on npmjs.com before the first tag; the package must exist first, so the first publish of `create-nanoeffects` may need a manual bootstrap of the name. Noted as a step in `tasks.md`.
- [Templates ignored by Biome drift in style] → they are short; the integration test and review catch breakage, not style.

## Migration Plan

Additive. Release as the next minor of both packages. Rollback: unpublish is not possible on npm; ship a fixed patch of both.
