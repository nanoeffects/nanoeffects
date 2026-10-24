// A command with its own effects, and a test that replaces one of them for a single call.
import { createBus } from "nanoeffects";
import { createCommand } from "nanoeffects/actions";
import { delay, race } from "nanoeffects/effects";
import { scopePlugin } from "nanoeffects/scope";

type User = { id: string; name: string };

// your own effect: the task goes first, and only its signal is used
const fetchUser = (ctx: { signal: AbortSignal }, id: string): Promise<User> =>
	fetch(`/users/${id}`, { signal: ctx.signal }).then((response) =>
		response.json(),
	);

// createCommand — third argument is the scope: effects of this command only
export const loadUser = createCommand(
	"user/load",
	(id: string, { fetchUser, race, delay }) => {
		// fetchUser, race and delay are bound to this task: no ctx argument
		const load = () => fetchUser(id);
		const giveUp = () => delay(5000);

		return race({ user: load, timeout: giveUp });
	},
	{ $effects: { fetchUser, race, delay } },
);

// scopePlugin — switches scopes on for this bus; without it the scope is ignored
const bus = createBus().use(scopePlugin());

// the real request
export const real = bus.emit(loadUser("1"));

// a test: the second argument of emit replaces `fetchUser` for this call only
const fakeFetchUser = async (
	_ctx: { signal: AbortSignal },
	id: string,
): Promise<User> => ({ id, name: "test" });
export const fake = bus.emit(loadUser("1"), {
	$effects: { fetchUser: fakeFetchUser },
});
