/**
 * The id of a heading, the way GitHub makes it: the pages are read on GitHub and on the site, and a link
 * to `#some-heading` must hit on both. VitePress makes other ids (it puts `_` before a leading digit and
 * turns a dot into a hyphen), so the config replaces its function with this one.
 */
export const slug = (heading: string) =>
	heading
		.replaceAll("`", "")
		.trim()
		.toLowerCase()
		.replace(/[^\p{L}\p{M}\p{N}\p{Pc}\- ]/gu, "")
		.replaceAll(" ", "-");
