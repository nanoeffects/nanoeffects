import { posix } from "node:path";

const repository = "https://github.com/nanoeffects/nanoeffects";

const isRelative = (href: string) => !/^([a-z][a-z0-9+.-]*:|\/|#)/i.test(href);

/**
 * A page links to `../README.md` or `../examples/guide.ts` to read well on GitHub.
 * On the site those files do not exist, so a link that leaves `docs/` goes to the repository.
 *
 * @example
 * repositoryLink("../examples/guide.ts", "guide.md");
 * // "https://github.com/nanoeffects/nanoeffects/blob/main/examples/guide.ts"
 */
export function repositoryLink(href: string, page: string) {
	if (!isRelative(href)) {
		return href;
	}
	const hashAt = href.indexOf("#");
	const path = hashAt === -1 ? href : href.slice(0, hashAt);
	const hash = hashAt === -1 ? "" : href.slice(hashAt);
	const target = posix.normalize(posix.join("docs", posix.dirname(page), path));
	if (target.startsWith("docs/")) {
		return href;
	}
	// a name with no extension is a directory of the repository
	const kind = posix.extname(target) === "" ? "tree" : "blob";
	return `${repository}/${kind}/main/${target}${hash}`;
}
