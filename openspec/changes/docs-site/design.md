## Context

`docs/` holds 35 pages written for GitHub and the npm package (`files` includes `docs`). `scripts/docs-check.mjs` type-checks their code blocks; `scripts/llms-full.mjs` checks `llms.txt` against the pages. Pages link to `../README.md`, `../CHANGELOG.md` and `../examples/...`, all outside `docs/`. The repo is a pnpm workspace (`packages/*`, `tools/*`).

## Goals / Non-Goals

**Goals:** a searchable site with a sidebar and stable URLs; `docs/*.md` unchanged and still readable on GitHub; no new dependency in the root or in the published package.

**Non-Goals:** versioned docs, i18n, a custom domain, rewriting pages, a playground in the site.

## Decisions

### VitePress, not Starlight, Docusaurus or GitBook

| Option | For | Against |
| ------ | --- | ------- |
| **VitePress** | Markdown as is, one config file, built-in local search, Shiki highlighting, small output, no framework to learn | Vue-based theme (only matters if we customise it) |
| Starlight (Astro) | Nice defaults, search (Pagefind) | Astro content collections want frontmatter and their own folder layout; more moving parts for plain pages |
| Docusaurus | Familiar, versioning | React and MDX: `{` and `<` in plain Markdown can break the build; heavy |
| GitBook | No build | Hosted product, content lives in its format and sync, not the repo |

VitePress takes the pages without frontmatter. The project already depends on Vite, so the toolchain is familiar.

### Source stays in `docs/`; the site is a package in `tools/docs-site`

`srcDir` points at `../../docs`, and `.vitepress` lives in `tools/docs-site`. Nothing is added to `docs/`, so the npm package and GitHub rendering are the same. The package has its own `devDependencies` (`vitepress`), which keeps them out of the root install path used by `pnpm verify` unless the site is built.

### Index and links

- `rewrites: { "README.md": "index.md" }` makes `docs/README.md` the home page.
- A markdown-it plugin in the config rewrites a relative link that resolves outside `docs/` to `https://github.com/nanoeffects/nanoeffects/blob/main/<path>` (`tree` for directories). The pages keep GitHub-friendly relative links.
- `ignoreDeadLinks` stays off: a dead link fails the build, which is the check we want.

### Sidebar by project level

The sidebar is a hand-written list in `tools/docs-site/.vitepress/sidebar.ts`, grouped by level (Start, Async UI, Unreliable network, Domain logic, Existing store, Reference), following `llms.txt`. A test (`sidebar.test.ts`) fails when a page of `docs/` is missing from the sidebar or the sidebar names a missing page, the same guard `llms:check` gives `llms.txt`. Generating it from `llms.txt` was considered; a hand list is simpler and the test keeps it honest. "Prefer the simple version first."

### Publishing

`docs.yml` builds with `pnpm --filter docs-site build` and deploys with the official Pages actions on a push to `main` that touches `docs/**` or `tools/docs-site/**`. CI (`ci.yml`) builds the site on pull requests so a dead link or broken page fails before merge. Base path `/nanoeffects/` is an assumption; it is one constant in the config.

### Interaction with existing checks

`docs:check` and `llms:check` read `docs/*.md` only, so they are unaffected. `<!-- docs-check: ... -->` comments are HTML comments and render as nothing. The built site is not part of `pnpm verify`; CI runs it as its own step so the site cannot slow the library gate.

## Risks / Trade-offs

- Vue-style `{{ }}` in code or prose is interpreted by VitePress outside fences → the build step finds it; fix with `v-pre` containers only where needed, and note it in tasks.
- A second toolchain to maintain → kept in `tools/`, no effect on `src/` or sizes.
- GitHub Pages base path is assumed → one constant; changes if a domain is chosen.
- Links to `examples/` point at `main` on GitHub, not at a tag; they can drift from a released version → acceptable for now (non-goal: versioned docs).
