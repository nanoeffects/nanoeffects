# Design

## Context

The wiring block of `examples/search.ts` and `examples/playground/main.ts` is compared as text by `src/tests/playground.test.ts` (from `bus.on(\n\t"typed"` to the first `\n);`), so a comment inside the block must be copied to both files byte for byte, with the same tabs. The README snippet and the first snippet of `docs/policies.md` already carry `// latest — a newer run aborts the older one`; the line that takes the signal has no comment. See proposal.md for motivation.

## Goals / Non-Goals

**Goals:**
- One sentence of why, next to the line that takes the signal, in the four places a level B reader meets the search flow.

**Non-Goals:**
- A shared snippet or include mechanism for the four copies.

## Decisions

**1. The comment goes on the line above `api.search`, inside the handler.**
AGENTS.md says to comment library calls and to say why, not what. `ctx.signal` is not a call, but it is the line the reader will drop. Wording (examples, two lines): `// latest aborts ctx.signal when a newer query arrives; passing it on cancels this request. Without it the old request keeps running and only its result is dropped.` The README and `docs/policies.md` use a shorter one-line form that fits their narrow code blocks: `// signal — lets latest cancel this request, not only drop its result`.
Alternative: explain it in the prose only. Rejected: the prose is already there and the question comes from the code.

**2. The example and the playground keep one text.**
The playground test is the guard; the comment is part of the compared block, so no test change is needed. A task checks the test still passes.

**3. No spec.**
Nothing observable by a user of the package changes; the playground spec requires "same wiring as `examples/search.ts`", which still holds.

## Risks / Trade-offs

- [The four copies drift later] → the example and the playground are guarded by the test; README and `docs/policies.md` are covered by `pnpm docs:check` only for correctness, not for wording. Accepted.
- [The claim is wrong for some API] → it is true for any API that takes an `AbortSignal` (`fetch`, most clients); the effect of an API without one is what the comment warns about. Checked against `docs/semantics.md` and `src/policies/latest.ts` in task 1.
