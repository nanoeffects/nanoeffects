import { fileURLToPath } from "node:url";
import { defineConfig } from "vitepress";
import { repositoryLink } from "./links";
import { ruSidebar, sidebar } from "./sidebar";
import { slug } from "./slug";

export default defineConfig({
	title: "nanoeffects",
	description:
		"Business logic and side effects outside UI components, as plain async functions.",
	// the pages stay in docs/ (GitHub and the npm package read them there)
	srcDir: "../../docs",
	// the site is served from the Pages of the repository
	base: "/nanoeffects/",
	cleanUrls: true,
	head: [["link", { rel: "icon", href: "/nanoeffects/favicon.png" }]],
	// the logo and favicon live next to the config, not in docs/ (the npm package ships docs/)
	vite: {
		publicDir: fileURLToPath(new URL("../public", import.meta.url)),
	},
	rewrites: { "README.md": "index.md", "ru/README.md": "ru/index.md" },
	locales: {
		root: { label: "English", lang: "en" },
		ru: {
			label: "Русский",
			lang: "ru-RU",
			link: "/ru/",
			description:
				"Бизнес-логика и побочные эффекты вне UI-компонентов, в виде обычных async-функций.",
			themeConfig: {
				outline: { label: "На странице" },
				docFooter: { prev: "Назад", next: "Дальше" },
				sidebarMenuLabel: "Меню",
				returnToTopLabel: "Наверх",
				langMenuLabel: "Язык",
				darkModeSwitchLabel: "Тема",
				lightModeSwitchTitle: "Светлая тема",
				darkModeSwitchTitle: "Тёмная тема",
			},
		},
	},
	themeConfig: {
		logo: "/logo.png",
		// the right-hand outline lists the ### headings too (every policy and effect)
		outline: [2, 3],
		sidebar: { "/ru/": ruSidebar, "/": sidebar },
		search: {
			provider: "local",
			options: {
				locales: {
					ru: {
						translations: {
							button: { buttonText: "Поиск", buttonAriaLabel: "Поиск" },
							modal: {
								noResultsText: "Ничего не найдено",
								resetButtonTitle: "Сбросить",
								footer: {
									selectText: "выбрать",
									navigateText: "перемещаться",
									closeText: "закрыть",
								},
							},
						},
					},
				},
			},
		},
		socialLinks: [
			{ icon: "github", link: "https://github.com/nanoeffects/nanoeffects" },
		],
	},
	markdown: {
		// the ids of the headings, as GitHub makes them
		anchor: { slugify: slug },
		config(md) {
			md.core.ruler.push("repository-links", (state) => {
				const page: string = state.env.relativePath ?? "index.md";
				for (const block of state.tokens) {
					for (const token of block.children ?? []) {
						if (token.type !== "link_open") {
							continue;
						}
						const href = token.attrGet("href");
						if (href) {
							token.attrSet("href", repositoryLink(href, page));
						}
					}
				}
			});
		},
	},
});
