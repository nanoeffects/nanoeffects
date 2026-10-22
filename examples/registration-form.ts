// Registration form, without a UI framework: the wiring of docs/react.md.
// A username check that does not race, a submit that cannot fire twice, a flaky network.
import { createBus } from "nanoeffects";
import { retry } from "nanoeffects/effects";
import { debounce, latest, leading } from "nanoeffects/policies";

type SignUpForm = { name: string; password: string };

type Api = {
	usernameAvailable(
		name: string,
		options: { signal: AbortSignal },
	): Promise<boolean>;
	signUp(form: SignUpForm, options: { signal: AbortSignal }): Promise<string>;
};

type Events = {
	"username/typed": string;
	"username/checked": { name: string; available: boolean };
	"form/submitted": SignUpForm;
	"form/succeeded": string;
	"form/failed": string;
	"form/closed": undefined;
};

// fetch rejects with a TypeError when the network fails; an HTTP error (name taken) is a plain Error
const isNetworkError = (error: unknown) => error instanceof TypeError;

const messageOf = (error: unknown) =>
	error instanceof Error ? error.message : "Sign up failed";

export const createRegistration = (api: Api) => {
	const bus = createBus<Events>();

	// debounce — wait 300 ms of quiet; latest — abort the check of the previous name
	bus.on(
		"username/typed",
		debounce(
			300,
			latest(async (name, ctx) => {
				// ctx.on — stop this check when the form is closed (the component unmounts)
				ctx.on("form/closed", () => ctx.abort());
				const available = await api.usernameAvailable(name, {
					signal: ctx.signal,
				});
				ctx.emit("username/checked", { name, available });
			}),
		),
	);

	// leading — a second click is ignored while the first sign up is running
	bus.on(
		"form/submitted",
		leading(async (form, ctx) => {
			ctx.on("form/closed", () => ctx.abort());
			const signUp = () => api.signUp(form, { signal: ctx.signal });
			try {
				// retry — up to 3 tries, 500 ms apart, only when the network failed
				const user = await retry(ctx, signUp, {
					times: 3,
					delay: 500,
					shouldRetry: isNetworkError,
				});
				ctx.emit("form/succeeded", user);
			} catch (error) {
				ctx.emit("form/failed", messageOf(error));
			}
		}),
	);

	return bus;
};
