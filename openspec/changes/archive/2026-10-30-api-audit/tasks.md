# Tasks

## 1. Pin the surface

- [x] 1.1 Add the missing entries (`scope`, `match`, `signal`, `oop`, `react`, `svelte`, `vue`, `dev`) to the runtime list in `src/tests/exports.test.ts`; verify `pnpm vitest run src/tests/exports.test.ts`
- [x] 1.2 Add a test of the type exports of every entry through the `typescript-5` compiler API, with the lists written out; verify it passes, and that removing a type from an `index.ts` makes it fail
- [x] 1.3 Add a check that every entry of `package.json` `exports` has a row in `docs/stability.md` (written in section 2 first), and that the Node versions and peer ranges on the page match `package.json` and `.github/workflows/ci.yml`

## 2. The stability page

- [x] 2.1 Write `docs/stability.md`: the table of entries (stable, unstable, one line each), the semver rules, the support policy, the permanent call forms; verify `pnpm docs:check`
- [x] 2.2 Link it from `docs/README.md` and add it to `llms.txt` in reading order; verify `pnpm llms:check`
- [x] 2.3 In `docs/effects.md` add the three call forms of `retry`, `timeout` and `poll` as permanent, and the reason `all` takes options in the `ctx` form only and `race` takes none; in `docs/oop.md` note that `On` is a decorator there and a type in the main entry; verify `pnpm docs:check`

## 3. Names

- [x] 3.1 Add `@deprecated` to `RaceStarter` in `src/effects/race.ts` pointing to `StarterOf`; verify `pnpm tsgo && pnpm check`
- [x] 3.2 Rename the local `StarterOf` in `src/effects/plugin.ts` to `BoundStarter`; verify `pnpm tsgo` and `src/effects/plugin.test.ts`

## 4. Changelog and verify

- [x] 4.1 Add a `### Changed` bullet under `## Unreleased` in `CHANGELOG.md`: `RaceStarter` is deprecated, a stability and support page is added (link to `docs/stability.md`)
- [x] 4.2 Run `pnpm format && pnpm tsgo && pnpm check && pnpm docs:check && pnpm llms:check && pnpm vitest run && pnpm build`, then `pnpm verify`; all pass

## Workflow follow-up

- Archive the change (`/opsx:archive`) after review; the delta is added as `openspec/specs/public-surface/spec.md`.
- Do not commit unless the owner asks.
