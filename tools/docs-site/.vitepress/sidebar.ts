export type SidebarItem = {
	text: string;
	link?: string;
	collapsed?: boolean;
	items?: SidebarItem[];
};

const nested = (page: string, names: string[]): SidebarItem[] =>
	names.map((name) => ({ text: name, link: `/${page}#${name.toLowerCase()}` }));

// Grouped by what the reader is doing, simple to complex. A group that holds the open page expands.
export const sidebar: SidebarItem[] = [
	{
		text: "Start",
		items: [
			{ text: "Guide", link: "/guide" },
			{ text: "Recipes", link: "/recipes" },
			{ text: "Start from a template", link: "/starter" },
			{ text: "Why nanoeffects", link: "/motivation" },
			{ text: "Package entries", link: "/package" },
		],
	},
	{
		text: "Async UI recipes",
		collapsed: true,
		items: [
			{ text: "Cancel stale requests", link: "/cancel-stale-requests" },
			{ text: "Debounce and abort", link: "/debounce-and-abort" },
			{ text: "Prevent a double submit", link: "/prevent-double-submit" },
			{ text: "Errors and unheard events", link: "/errors" },
		],
	},
	{
		text: "Policies",
		collapsed: true,
		items: [
			{
				text: "Policies",
				link: "/policies",
				items: nested("policies", [
					"latest",
					"leading",
					"debounce",
					"throttle",
					"queue",
					"key",
					"withPolicy",
				]),
			},
		],
	},
	{
		text: "Effects",
		collapsed: true,
		items: [
			{
				text: "Effects and cancellation",
				link: "/effects",
				items: nested("effects", [
					"retry",
					"timeout",
					"poll",
					"backoff",
					"delay",
					"cancellable",
					"take",
					"all",
					"allSettled",
					"race",
					"effectsPlugin",
				]),
			},
		],
	},
	{
		text: "Domain logic",
		collapsed: true,
		items: [
			{ text: "Actions, jobs and modules", link: "/actions" },
			{ text: "Context fields", link: "/context" },
			{ text: "Scopes", link: "/scope" },
			{ text: "Use the bus from a class", link: "/oop" },
			{ text: "TypeScript in many files", link: "/typescript" },
			{ text: "Chat example", link: "/chat-example" },
			{ text: "Chat widget", link: "/chat-widget" },
		],
	},
	{
		text: "Frameworks",
		collapsed: true,
		items: [
			{ text: "React", link: "/react" },
			{ text: "Vue", link: "/vue" },
			{ text: "Svelte", link: "/svelte" },
		],
	},
	{
		text: "Libraries and stores",
		collapsed: true,
		items: [
			{ text: "Redux, Zustand, MobX, Pinia", link: "/stores" },
			{ text: "React Query, SWR, RTK Query", link: "/query-libraries" },
			{ text: "Observables (RxJS bridge)", link: "/observable" },
		],
	},
	{
		text: "Servers",
		collapsed: true,
		items: [{ text: "Stop work when the client leaves", link: "/server" }],
	},
	{
		text: "Migrating from",
		collapsed: true,
		items: [
			{ text: "redux-saga", link: "/migrating-from-saga" },
			{ text: "Effector", link: "/migrating-from-effector" },
			{ text: "mitt, nanoevents, EventEmitter", link: "/migrating-from-mitt" },
			{ text: "RxJS", link: "/migrating-from-rxjs" },
		],
	},
	{
		text: "Reference",
		collapsed: true,
		items: [
			{ text: "Semantics", link: "/semantics" },
			{ text: "Plugins", link: "/plugins" },
			{ text: "Trace tasks", link: "/tracing" },
			{ text: "Hot reload and dev diagnostics", link: "/hmr" },
			{ text: "Stability", link: "/stability" },
		],
	},
];

const russian: Record<string, string> = {
	Start: "Начало",
	Guide: "Руководство",
	Recipes: "Рецепты",
	"Start from a template": "Проект из шаблона",
	"Why nanoeffects": "Зачем нужна библиотека",
	"Package entries": "Точки входа пакета",
	"Async UI recipes": "Рецепты для async UI",
	"Cancel stale requests": "Отмена устаревших запросов",
	"Debounce and abort": "Debounce и отмена",
	"Prevent a double submit": "Защита от двойной отправки",
	"Errors and unheard events": "Ошибки и события без подписчиков",
	Policies: "Политики",
	Effects: "Эффекты",
	"Effects and cancellation": "Эффекты и отмена",
	"Domain logic": "Доменная логика",
	"Actions, jobs and modules": "Actions, jobs и модули",
	"Context fields": "Поля контекста",
	Scopes: "Области (scope)",
	"Use the bus from a class": "Шина в классе",
	"TypeScript in many files": "TypeScript в нескольких файлах",
	"Chat example": "Пример: чат",
	"Chat widget": "Пример: виджет чата",
	Frameworks: "Фреймворки",
	"Libraries and stores": "Библиотеки и сторы",
	"Redux, Zustand, MobX, Pinia": "Redux, Zustand, MobX, Pinia",
	"React Query, SWR, RTK Query": "React Query, SWR, RTK Query",
	"Observables (RxJS bridge)": "Observable (мост к RxJS)",
	Servers: "Backend",
	"Stop work when the client leaves": "Остановка работы, когда клиент ушёл",
	"Migrating from": "Переход с других библиотек",
	"mitt, nanoevents, EventEmitter": "mitt, nanoevents, EventEmitter",
	Reference: "Справочник",
	Semantics: "Семантика",
	Plugins: "Плагины",
	"Trace tasks": "Трассировка задач",
	"Hot reload and dev diagnostics": "Горячая перезагрузка и диагностика",
	Stability: "Стабильность",
};

const localize = (items: SidebarItem[]): SidebarItem[] =>
	items.map((item) => {
		const { text, link, items: children, ...rest } = item;
		return {
			...rest,
			text: russian[text] ?? text,
			...(link === void 0
				? {}
				: { link: link.startsWith("/") ? `/ru${link}` : link }),
			...(children === void 0 ? {} : { items: localize(children) }),
		};
	});

export const ruSidebar = localize(sidebar);
