// Builds the text of a GitHub release from CHANGELOG.md: the section of one version, links to the
// repository made absolute (a release page has no folder to resolve `docs/…` against), and a link
// to the changes since the version before it.
// `node scripts/release-notes.mjs v0.13.0` prints it; the Release workflow and a hand edit of an
// old release (`gh release edit v0.12.0 --notes-file …`) use the same text.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const repository = "https://github.com/nanoeffects/nanoeffects";
const heading = /^## (\d+\.\d+\.\d+)\s*$/;

/** The lines of the section of `version` and the version listed right after it, or `undefined`. */
export function sectionOf(changelog, version) {
	const lines = changelog.split("\n");
	const start = lines.findIndex((line) => heading.exec(line)?.[1] === version);
	if (start === -1) {
		return;
	}

	const rest = lines.slice(start + 1);
	const next = rest.findIndex((line) => line.startsWith("## "));
	const body = next === -1 ? rest : rest.slice(0, next);
	const previous = next === -1 ? void 0 : heading.exec(rest[next] ?? "")?.[1];

	return { body: body.join("\n").trim(), previous };
}

/** Markdown links to files of the repository, made absolute for the tag `tag`. */
export function absoluteLinks(text, tag) {
	return text.replace(
		/\]\(((?:docs|examples|skills)\/[^)]*)\)/g,
		(_, path) => `](${repository}/blob/${tag}/${path})`,
	);
}

/** The release text for a tag such as `v0.13.0`. */
export function releaseNotes(changelog, tag) {
	const version = tag.replace(/^v/, "");
	const section = sectionOf(changelog, version);
	if (!section) {
		throw new Error(`CHANGELOG.md has no section "## ${version}"`);
	}

	const compare = section.previous
		? `\n\n**Full changelog**: ${repository}/compare/v${section.previous}...${tag}`
		: "";

	return `${absoluteLinks(section.body, tag)}${compare}\n`;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
	const tag = process.argv[2];
	if (!tag) {
		console.error("usage: node scripts/release-notes.mjs v0.13.0");
		process.exit(1);
	}
	const changelog = readFileSync(join(root, "CHANGELOG.md"), "utf8");
	process.stdout.write(releaseNotes(changelog, tag));
}
