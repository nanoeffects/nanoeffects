# Contributing

Thanks for looking. Bug reports, questions and small fixes are welcome. For a new feature or an API change, open an issue first so we can agree on the shape before you write code.

## Set up

You need Node 22 or newer and [pnpm](https://pnpm.io).

```bash
pnpm install
pnpm verify   # type check, lint, docs, tests, build, bundle size: what CI runs
```

Run one thing while you work:

```bash
pnpm vitest run src/effects   # tests of one folder
pnpm tsgo                     # type check
pnpm check                    # lint
```

## Make a change

1. Write a test that fails without your change. Tests sit next to the file they test.
2. Keep the change small and in the style of the code around it.
3. If a caller can notice the change, update the docs in `docs/` and add a line under `Unreleased` in `CHANGELOG.md`.
4. Run `pnpm verify`.

Commits follow [Conventional Commits](https://www.conventionalcommits.org/) in English (`feat(effects): …`, `fix(actions): …`, `docs: …`). The hook checks the message.

## Where things are

[AGENTS.md](AGENTS.md) explains the layout, the decisions that are easy to undo by mistake, and the documentation rules. Read the part you are changing before you start. Changes to behavior or the public API are planned in `openspec/`; the maintainer will say if yours needs it.

## What is stable

[Stability](docs/stability.md) lists which entries are stable. An unstable entry can change in a minor release.
