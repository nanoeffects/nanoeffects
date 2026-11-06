# Countdown example

"Take the discount in 15 seconds": a timer, a **Take the discount** button and a **Restart** button.

```bash
npm install
npm run dev
```

All the logic is in `src/session.ts`: one handler runs a `race` between the button (`take("claim")`),
the countdown, and `take("stop")`. The first to finish wins and the others are aborted.

**Restart** disposes the old session (`stop` ends its race and its timer, `off()` removes its listeners) and creates a new bus. The
old session cannot change the page: its timer is stopped and its subscriptions are removed.

## Proof that nothing is left

The page shows what is alive on the current session (`timer running`, `listeners: N`). Press
**Restart** and a green line appears for the old session: `timer stopped, listeners left: 0`. It
is measured after `dispose()` has finished, with `bus.get().length` for the listeners and a flag
that the countdown sets in `finally` for the timer.
