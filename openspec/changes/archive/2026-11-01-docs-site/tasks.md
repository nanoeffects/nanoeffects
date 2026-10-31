## 1. Site package

- [x] 1.1 Create `tools/docs-site` (`package.json` with `vitepress`, `.vitepress/config.ts` with `srcDir: "../../docs"`, `base: "/nanoeffects/"`, local search, `rewrites` for `README.md`), and add its build script; run `pnpm install` for the lockfile. Test: the build produces `index.html` and one page per `docs/*.md`.
- [x] 1.2 Add the markdown-it link plugin that sends links outside `docs/` to GitHub (`blob` for files, `tree` for directories). Test: unit test of the rewrite function for `../README.md`, `../CHANGELOG.md`, `../examples/guide.ts`, `../examples/counter`, and an inside link left alone.
- [x] 1.3 Write `sidebar.ts` grouped by project level, following `llms.txt`. Test: `sidebar.test.ts` fails on a page missing from the sidebar and on an entry with no page.
- [x] 1.4 Run the build; fix dead links and any `{{ }}` or HTML that VitePress reads wrongly, with `v-pre` only where needed and without editing the meaning of a page. Test: the build passes with dead links on.

## 2. CI and publishing

- [x] 2.1 Add a site build step to `ci.yml` (own step, not part of `pnpm verify`). Test: run it locally and break a link on purpose to see it fail.
- [x] 2.2 Add `.github/workflows/docs.yml` (build, upload the Pages artifact, deploy on a push to `main` touching `docs/**` or `tools/docs-site/**`). Test: `actionlint` or a dry read; check the Pages setting in the repository.

## 3. Links and wrap-up

- [x] 3.1 Link the site from `README.md` (one line near the Docs jump) and set `package.json` `homepage`. Test: `pnpm llms:check` and `pnpm docs:check` still pass; `docs:check` output equals the output before.
- [x] 3.2 Add the site to the Layout and Tooling notes in AGENTS.md (one line each). Test: n/a, wording only.
- [x] 3.3 Run `pnpm format && pnpm tsgo && pnpm check && pnpm docs:check && pnpm llms:check && pnpm vitest run && pnpm build`; confirm `pnpm size` limits and `pnpm lint:package` are unchanged.
