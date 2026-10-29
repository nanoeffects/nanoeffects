# Tasks

## 1. Workspace and package skeleton

- [x] 1.1 Add `packages: ["packages/*"]` to `pnpm-workspace.yaml`; create `packages/create-nanoeffects/package.json` (name, version equal to the root, `bin`, `files`, `engines.node >=18`, `type: module`, no dependencies); verify `pnpm install --frozen-lockfile` is clean after `pnpm install`.
- [x] 1.2 Add `./packages` to the `check` and `format` scripts and `!packages/*/templates` to `biome.json`; verify `pnpm check` passes and does not read the templates.

## 2. CLI

- [x] 2.1 Write `packages/create-nanoeffects/index.js`: arguments (`<dir>`, `--template`), template list, refusal of a non-empty directory and an unknown template, copy with `_gitignore` rename, substitution of `name` and the `nanoeffects` range in `package.json` only. Add `index.test.js` (run by the root `vitest`) with a test for each scenario of `create-starter`, using `harness`-style names; verify `pnpm vitest run packages` passes.
- [x] 2.2 Add prompts for a missing name or template in a terminal, the no-terminal failure, and the next-steps message per package manager (`npm_config_user_agent`); verify with tests that inject the input and the user agent.

## 3. Templates

- [x] 3.1 Create `templates/vanilla` (Vite, `src/bus.js`, `src/search.js`, `src/search-handlers.js`, `src/main.js`, `index.html`, `_gitignore`) with a comment on every nanoeffects call; verify the layout scenario with a test that reads the imports of the files.
- [x] 3.2 Create `templates/react` (`useEmitter`, `usePolicy`, `@vitejs/plugin-react`) in the same layout; verify the same test passes for it.

## 4. Integration test

- [x] 4.1 Write `integration/starter.test.ts`: pack both packages, scaffold each template with the packed CLI, install with the packed `nanoeffects`, run `vite build`, load the output; verify `pnpm test:integration` passes after `pnpm build`, and fails when a template imports a name that is not exported (try it once by hand).

## 5. Release and CI

- [x] 5.1 Change `.github/workflows/release.yml`: check the tag against both `package.json` files, then `npm publish --provenance --access public` for the root and for `packages/create-nanoeffects`, in that order; update the header comment. Verify with `actionlint` or a dry read of the workflow, and with a local run of the version check against a mismatching version.
- [x] 5.2 Add `publint` for the CLI package to `lint:package` and the CLI tests to the CI `verify` job if `pnpm test` does not already run them; verify `pnpm lint:package` passes.
- [x] 5.3 Update `AGENTS.md` (layout and release sections: the package, the shared version, the publish order, the trusted publisher of the new package); verify the text matches the workflow.

## 6. Documentation

- [x] 6.1 Write `docs/starter.md` (level A: what you get, the command for each package manager, the two templates, what to change first) and add it to `llms.txt`; verify `pnpm docs:check` and `pnpm llms:check` pass.
- [x] 6.2 Add one line with `npm create nanoeffects@latest` to the README install section and an `### Added` bullet under `## Unreleased` in `CHANGELOG.md`; verify the README keeps the level A/B rule (no new example).

## 7. Final checks

- [x] 7.1 Run `pnpm format && pnpm tsgo && pnpm check && pnpm docs:check && pnpm llms:check && pnpm vitest run && pnpm build && pnpm test:integration && pnpm lint:package && pnpm size`; verify all pass and the size of `createBus` is unchanged.
- [x] 7.2 Run the packed CLI by hand: `npm create` equivalent from the tarball, `npm install`, `npm run dev`; verify the page works in a browser.

## Workflow follow-up

- Before the first tag, the owner adds `create-nanoeffects` on npmjs.com (name bootstrap) and its trusted publisher for `release.yml`.
- Archive the change after the first release that includes the package.
