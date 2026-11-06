# Countdown example

"Take the discount in 15 seconds": a timer, a **Take the discount** button and a **Restart** button.

```bash
npm install
npm run dev
```

All the logic is in `src/session.ts`: one handler runs a `race` between the button (`take("claim")`),
the countdown, and `take("stop")`. The first to finish wins and the others are aborted.

**Restart** disposes the old session (`stop` ends its race and its timer) and creates a new bus. The
old session cannot change the page: its timer is stopped and its subscriptions are removed.
