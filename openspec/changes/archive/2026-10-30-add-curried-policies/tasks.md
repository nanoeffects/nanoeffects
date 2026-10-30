## 1. Policies

- [x] 1.1 Add the wrapper overload and the run-time check to `latest`, `leading` and `queue` (`(options?) => Wrapper`), with a doc comment and `@example` for each overload
- [x] 1.2 Add the wrapper overload to `debounce` and `throttle` (`(ms, options?) => Wrapper`)
- [x] 1.3 Tests next to each policy: the wrapper behaves as the direct call, options go through (`key`, `leading`/`trailing`), each application is a new policy, a job reports `pending` with one closing outcome through a wrapper
- [x] 1.4 `src/tests/types.test.ts`: inference of payload and result through a wrapper; `key` typed from an annotated parameter; `usePolicy(callback, debounce(100, other))` rejected with `@ts-expect-error`

## 2. React hook

- [x] 2.1 `src/react/use-policy.test.ts`: a wrapper as `make` survives re-renders, `deps` rebuild it, Strict Mode and unmount still cancel; the form `(task) => ...` still passes
- [x] 2.2 Update the doc comment and `@example` of `usePolicy` to the wrapper form

## 3. Docs and examples

- [x] 3.1 `docs/policies.md`: explain the two ways to call a policy (with the task; without it, for `usePolicy`), the `key` limit, and nesting for combined policies
- [x] 3.2 Switch `usePolicy` snippets to the wrapper in `docs/react.md`, `docs/starter.md`, `docs/debounce-and-abort.md`, `docs/prevent-double-submit.md`, (`examples/` has no `usePolicy`); keep one `(task) => ...` snippet for combined policies; check each snippet against the code-example rules of AGENTS.md. The starter templates (`react`, `react-ts`) keep `(task) => ...` until the release: they install `nanoeffects@latest`, which has no wrapper form yet
- [x] 3.3 `CHANGELOG.md` under `Unreleased` (`Added`), one or two lines with a link to `docs/policies.md`

## 4. Verify

- [x] 4.1 `pnpm format && pnpm tsgo && pnpm check && pnpm docs:check && pnpm llms:check && pnpm vitest run && pnpm build`
- [x] 4.2 `pnpm size`: the limit of `nanoeffects/policies` holds, `createBus` is unchanged
