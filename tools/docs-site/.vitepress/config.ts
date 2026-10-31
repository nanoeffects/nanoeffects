import { fileURLToPath } from "node:url";
import { defineConfig } from "vitepress";
import { repositoryLink } from "./links";
import { sidebar } from "./sidebar";

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
	rewrites: { "README.md": "index.md" },
	themeConfig: {
		logo: "/logo.png",
		sidebar,
		search: { provider: "local" },
		socialLinks: [
			{ icon: "github", link: "https://github.com/nanoeffects/nanoeffects" },
		],
	},
	markdown: {
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
