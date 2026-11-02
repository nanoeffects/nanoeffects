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
			{ text: "Common tasks", link: "/recipes" },
			{ text: "Start from a template", link: "/starter" },
			{ text: "Why nanoeffects", link: "/motivation" },
			{ text: "Package entries", link: "/package" },
		],
	},
	{
		text: "Working with async",
		collapsed: true,
		items: [
			{ text: "Cancel stale requests", link: "/cancel-stale-requests" },
			{ text: "Pause between requests", link: "/debounce-and-abort" },
			{ text: "Prevent a double submit", link: "/prevent-double-submit" },
			{ text: "Errors and unheard events", link: "/errors" },
			{ text: "Keep the signal through a handler", link: "/pass-the-signal" },
		],
	},
	{
		text: "Policies",
		link: "/policies",
		collapsed: true,
		items: nested("policies", [
			"latest",
			"leading",
			"debounce",
			"throttle",
			"queue",
			"key",
		]),
	},
	{
		text: "Effects",
		link: "/effects",
		collapsed: true,
		items: [
			...nested("effects", [
				"retry",
				"timeout",
				"poll",
				"backoff",
				"delay",
				"cancellable",
				"onAbort",
				"take",
				"all",
				"allSettled",
				"race",
				"effectsPlugin",
			]),
			{
				text: "Effects outside a task",
				link: "/effects#effects-outside-a-task",
			},
		],
	},
	{
		text: "Domain logic",
		collapsed: true,
		items: [
			{ text: "Actions, jobs and modules", link: "/actions" },
			{ text: "Working with context", link: "/context" },
			{ text: "Working with OOP", link: "/oop" },
			{ text: "Working with TypeScript", link: "/typescript" },
			{
				text: "Examples",
				link: "/examples",
				items: [
					{ text: "Chat example", link: "/chat-example" },
					{ text: "Chat widget", link: "/chat-widget" },
				],
			},
		],
	},
	{
		text: "Ecosystem",
		collapsed: true,
		items: [
			{ text: "React", link: "/react" },
			{ text: "Vue", link: "/vue" },
			{ text: "Svelte", link: "/svelte" },
			{ text: "Observable", link: "/observable" },
			{ text: "Node.js", link: "/server" },
		],
	},
	{
		text: "Infrastructure",
		collapsed: true,
		items: [
			{ text: "HTTP requests", link: "/query-libraries" },
			{ text: "State managers", link: "/stores" },
		],
	},
	{
		text: "Migrating from",
		collapsed: true,
		items: [
			{ text: "RxJS", link: "/migrating-from-rxjs" },
			{ text: "mitt and nanoevents", link: "/migrating-from-mitt" },
			{ text: "redux-saga", link: "/migrating-from-saga" },
			{ text: "Effector", link: "/migrating-from-effector" },
		],
	},
	{
		text: "Reference",
		collapsed: true,
		items: [
			{ text: "Semantics", link: "/semantics" },
			{ text: "Plugins", link: "/plugins" },
			{ text: "Test time with diagrams", link: "/testing" },
			{ text: "Trace tasks", link: "/tracing" },
			{ text: "Debugging compared", link: "/debugging-compared" },
			{ text: "Find and cut event loops", link: "/debugging-loops" },
			{ text: "Cut a loop with loopGuardPlugin", link: "/loop-guard" },
			{ text: "Hot reload and dev diagnostics", link: "/hmr" },
		],
	},
];

const russian: Record<string, string> = {
	Start: "Начало",
	Guide: "Руководство",
	"Common tasks": "Типовые задачи",
	"Start from a template": "Проект из шаблона",
	"Why nanoeffects": "Зачем нужна библиотека",
	"Package entries": "Точки входа пакета",
	"Working with async": "Работа с асинхронностью",
	"Cancel stale requests": "Отмена устаревших запросов",
	"Pause between requests": "Пауза между запросами",
	"Keep the signal through a handler": "Сохранение сигнала в обработчике",
	"Prevent a double submit": "Защита от повторной отправки",
	"Errors and unheard events": "Ошибки и события без подписчиков",
	Policies: "Политики",
	Effects: "Эффекты",
	"Effects and cancellation": "Эффекты и отмена",
	"Domain logic": "Доменная логика",
	"Actions, jobs and modules": "Actions, jobs и модули",
	"Working with context": "Работа с контекстом",
	"Working with OOP": "Работа с ООП",
	"Working with TypeScript": "Работа с TypeScript",
	Examples: "Примеры",
	"Chat example": "Пример: чат",
	"Chat widget": "Пример: виджет чата",
	Ecosystem: "Экосистема",
	Infrastructure: "Инфраструктура",
	"HTTP requests": "HTTP-запросы",
	"Effects outside a task": "Эффекты вне задачи",
	Observable: "Observable",
	"Migrating from": "Переход с других библиотек",
	"mitt and nanoevents": "mitt и nanoevents",
	Reference: "Справочник",
	Semantics: "Семантика",
	Plugins: "Плагины",
	"Test time with diagrams": "Тесты времени диаграммами",
	"Trace tasks": "Трассировка задач",
	"Debugging compared": "Отладка в сравнении с RxJS, Effector и mitt",
	"Find and cut event loops": "Поиск и обрыв циклов событий",
	"Cut a loop with loopGuardPlugin": "Обрыв цикла через loopGuardPlugin",
	"Hot reload and dev diagnostics": "Hot reload и диагностика",
};

// the heading of a Russian page has its own id, so a link to a section needs the Russian one
const russianAnchors: Record<string, string> = {
	"effects-outside-a-task": "эффекты-вне-задачи",
};

const localLink = (link: string) => {
	const [path = "", anchor] = link.split("#");
	const local =
		anchor === void 0 ? path : `${path}#${russianAnchors[anchor] ?? anchor}`;
	return local.startsWith("/") ? `/ru${local}` : local;
};

const localize = (items: SidebarItem[]): SidebarItem[] =>
	items.map((item) => {
		const { text, link, items: children, ...rest } = item;
		return {
			...rest,
			text: russian[text] ?? text,
			...(link === void 0 ? {} : { link: localLink(link) }),
			...(children === void 0 ? {} : { items: localize(children) }),
		};
	});

export const ruSidebar = localize(sidebar);
