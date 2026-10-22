// One feature in its own file: a command with its handler, and the module.
import { createCommand, createModule } from "nanoeffects/actions";

export type User = { id: string; name: string };

// createCommand — the payload comes from `id: string`, the result from the body
export const getUser = createCommand(
	"user/get",
	async (id: string, { signal }) => {
		const response = await fetch(`/api/users/${id}`, { signal });
		const user: User = await response.json();
		return user;
	},
);

// createModule — m.use binds the handler the command carries, while the module is mounted
export const userModule = createModule("user", (m) => {
	m.use(getUser);
});
