# Design

## Context

`docs/` has 17 pages (including `README.md`, which is the human index and is not linked from `llms.txt`) (about 80 kB) and `docs/README.md` already lists them by need and as a reference, but it is for people and links with anchors. `package.json` ships `docs/` in `files`, `pnpm build` is `tsdown && node scripts/notrace-types.mjs`, and `scripts/*.mjs` have vitest tests (`scripts/**/*.test.mjs`, from `user-dx`). See proposal.md for motivation.

## Goals / Non-Goals

**Goals:**
- One hand-written index and one generated full text, with the page list and its order living in one place.
- A new docs page cannot be forgotten: the check fails.

**Non-Goals:**
- Reuse of `docs/README.md` as the index: it links with anchors, has tables, and is written for humans. The summary rules and page descriptions for an assistant differ.

## Decisions

**1. `llms.txt` is the single source of the page list and order.**
The generator and the check read the links of `llms.txt` (lines `- [Title](docs/x.md): description`). There is no second list in a script. Alternative: take the order from `docs/README.md` or sort by file name: rejected, the order is a content decision (guide first) and would hide in code.

**2. Relative links in `llms.txt`.**
`docs/x.md` resolves in the repository, in `node_modules/nanoeffects/`, and on unpkg. Absolute `raw.githubusercontent.com` URLs would point at `main`, not at the installed version, and that is the very mistake this change removes. Alternative: absolute URLs of the published version, rejected: the version would have to be rewritten at release time.

**3. `llms-full.txt` is generated at build and not committed.**
It is `llms.txt` summary, then for each linked page `\n---\nSource: docs/x.md\n\n` and the page text. No link rewriting: the `Source:` line tells where relative links (`guide.md#...`) point. Alternative: commit it and check freshness (`--check`): rejected for now, it adds a noisy diff to every docs edit; the cost is that GitHub shows no full file, while npm and unpkg do. If the owner wants it on GitHub, committing is a small follow-up.

**4. One script, two modes.**
`scripts/llms-full.mjs` exports `readIndex`, `buildFull` and `checkIndex`; run with no arguments it writes `llms-full.txt`, with `--check` it only checks the index against `docs/` and `package.json` `exports`. `pnpm build` calls the write mode, `pnpm llms:check` the other. Tests import the functions, as `docs-check.test.mjs` does.

**5. The `exports` check is shallow.**
It checks that each `nanoeffects/<entry>` import path written in the summary of `llms.txt` is an `exports` key of `package.json`; it does not parse the prose. A pattern `nanoeffects/<name>` is enough for that.

**6. Where it is mentioned.**
`docs/package.md` (the reference of entries) gets the paragraph: that is where a reader who already looks for entries goes. The README stays untouched (the section gate: removing the link does not stop a level A reader).

## Risks / Trade-offs

- [`llms.txt` summary drifts from the API] → the `exports` check catches the entries; the rest is covered by review and by `docs:check`, which checks the code in the pages the summary links to.
- [The tarball grows by about 80 kB] → accepted: it is documentation the package already ships once; `llms-full.txt` doubles it. Measured: `llms-full.txt` is 80 kB (about 20 kB gzip) and `llms.txt` 2.6 kB.
- [Relative links inside `llms-full.txt` are dead when read as one file] → the `Source:` line names the folder; assistants resolve `guide.md#x` against it. Rewriting would change page text, which the spec forbids.
- [A build step writes outside `dist/`] → the file is ignored by git and named in `files`; `lint:package` (publint) checks that `files` entries exist.

## Open Questions

- Commit `llms-full.txt` so GitHub raw serves it? Can be decided after the first release; it does not change the specs.
