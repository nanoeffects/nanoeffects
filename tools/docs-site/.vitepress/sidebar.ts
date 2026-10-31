// Grouped as llms.txt is: by what the reader is building, simple to complex.
export const sidebar = [
	{
		text: "Start here",
		items: [
			{ text: "Guide", link: "/guide" },
			{ text: "Start from a template", link: "/starter" },
			{ text: "Why nanoeffects", link: "/motivation" },
			{ text: "Package entries", link: "/package" },
			{ text: "Stability", link: "/stability" },
			{ text: "Plugins", link: "/plugins" },
		],
	},
	{
		text: "Async UI and unreliable networks",
		items: [
			{ text: "Policies", link: "/policies" },
			{ text: "Cancel stale requests", link: "/cancel-stale-requests" },
			{ text: "Debounce and abort", link: "/debounce-and-abort" },
			{ text: "Prevent a double submit", link: "/prevent-double-submit" },
			{ text: "Effects and cancellation", link: "/effects" },
			{ text: "Errors and unheard events", link: "/errors" },
		],
	},
	{
		text: "Domain logic and stores",
		items: [
			{ text: "Actions, jobs and modules", link: "/actions" },
			{ text: "Redux, Zustand, MobX, Pinia", link: "/stores" },
			{ text: "React Query, SWR, RTK Query", link: "/query-libraries" },
			{ text: "Server: stop work on leave", link: "/server" },
			{ text: "Sign-up form in React", link: "/react" },
			{ text: "Chat example", link: "/chat-example" },
			{ text: "Chat widget", link: "/chat-widget" },
			{ text: "Vue", link: "/vue" },
			{ text: "Svelte", link: "/svelte" },
			{ text: "Context fields", link: "/context" },
			{ text: "Scopes", link: "/scope" },
			{ text: "Use the bus from a class", link: "/oop" },
		],
	},
	{
		text: "TypeScript",
		items: [{ text: "TypeScript in many files", link: "/typescript" }],
	},
	{
		text: "Coming from another library",
		items: [
			{ text: "redux-saga", link: "/migrating-from-saga" },
			{ text: "Effector", link: "/migrating-from-effector" },
			{ text: "mitt, nanoevents, EventEmitter", link: "/migrating-from-mitt" },
			{ text: "RxJS", link: "/migrating-from-rxjs" },
		],
	},
	{
		text: "Reference",
		items: [
			{ text: "Semantics", link: "/semantics" },
			{ text: "Trace tasks", link: "/tracing" },
			{ text: "Observables", link: "/observable" },
			{ text: "Hot reload and dev diagnostics", link: "/hmr" },
		],
	},
];
