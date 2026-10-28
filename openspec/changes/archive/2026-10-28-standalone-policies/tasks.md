# Tasks

## 1. withPolicy

- [x] 1.1 Add `src/policies/with-policy.ts` (`withPolicy(task)` with `cancel`, conditional `[Symbol.dispose]`, typed with `PayloadOf`), export it from `src/policies/index.ts`; verify with `pnpm tsgo`.
- [x] 1.2 Add `src/policies/with-policy.test.ts` (fake timers) covering the scenarios of `specs/with-policy/spec.md`: debounce, latest, throttle, queue, void payload, ctx fields (`signal`, `abort`, `run`, no-op `emit` / `on`), `cancel` before and after, use after cancel, errors, no `Symbol.dispose` (delete it in the test); verify `pnpm vitest run src/policies/with-policy.test.ts` passes.
- [x] 1.3 Add type tests to `src/tests/types.test.ts` (inferred `P` and `R`, `void` payload callable without an argument, wrong payload under `@ts-expect-error`); verify `pnpm tsgo`.
- [x] 1.4 Check tree shaking: bundle an import of only `debounce` with rolldown and verify `withPolicy` is absent; run `pnpm size` and raise the "policies (all)" limit in `package.json` only by the measured amount.

## 2. usePolicy

- [x] 2.1 Add `src/react/use-policy.ts` (`usePolicy(callback, make, deps = [])`: callback in a ref, `make` once per `deps` with `useMemo`, `withPolicy` around it, `cancel()` in an effect cleanup) and export it from `src/react/index.ts`; verify `pnpm tsgo`.
- [x] 2.2 Add `src/react/use-policy.test.ts` covering the scenarios of `specs/use-policy-hook/spec.md`: same identity across renders, debounce kept across re-renders, latest callback, new policy on `deps` change, cancel on unmount, `StrictMode`; verify `pnpm vitest run src/react/use-policy.test.ts` passes.
- [x] 2.3 Add type tests to `src/tests/types.test.ts` (`P` and `R` inferred from `callback`, `make` gets a task of the same payload, wrong payload under `@ts-expect-error`); verify `pnpm tsgo`.
- [x] 2.4 Run `pnpm size`; raise the "react" limit in `package.json` only by the measured amount, and check an app that imports only `reactPlugin` does not contain `usePolicy`.

## 3. Docs

- [x] 3.1 Add a section "Use a policy without a bus" to `docs/policies.md`: problem first (a debounced input handler with no bus), JS example `const onChange = withPolicy(debounce(300, callback))`, `onChange.cancel()` on unmount, `using`, a note that `emit` and `on` do nothing; verify `pnpm docs:check`.
- [x] 3.2 Add the `withPolicy` variant to the recipes that fit it: `docs/debounce-and-abort.md` (a debounced handler with no bus, cancelled on unmount) and `docs/prevent-double-submit.md` (`leading` / `queue` as a plain function); each snippet defines its own names; verify `pnpm docs:check`.
- [x] 3.3 Link the new section from `docs/guide.md` (where policies are introduced) and add a section to `docs/react.md` for `usePolicy` (a debounced handler in a component: problem first, the stale-closure and reset-on-render trap of making the policy in the body, JS example `usePolicy(callback, (task) => debounce(300, task))`, `deps` when `make` reads a prop); add one line to the README "Docs by need" list only if it stays within the README rules (levels A to B); verify the links resolve.
- [x] 3.4 Update the policy line in `llms.txt` (names `withPolicy` and `usePolicy`) and add an entry under `Unreleased` in `CHANGELOG.md`; verify `pnpm llms:check`.

## 4. Integration

- [x] 4.1 Run `pnpm format && pnpm tsgo && pnpm check && pnpm docs:check && pnpm llms:check && pnpm vitest run && pnpm build`, then `pnpm verify`; verify all pass.

## Workflow follow-up

- Archive the change after review (`/opsx:archive`).
