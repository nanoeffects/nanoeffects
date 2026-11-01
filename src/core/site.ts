// Where a named listener was made, kept by its name while it is subscribed. `devPlugin` writes it
// in development, `graphLogger` reads it for its reports; `createBus` imports none of it.
const sites = new Map<string, { site: string; count: number }>();

/** Notes the site of a listener name and returns the function that drops it when the listener is removed. */
export const recordSite = (name: string, site: string) => {
	const held = sites.get(name);
	sites.set(name, { site: held?.site ?? site, count: (held?.count ?? 0) + 1 });
	let dropped = false;

	return () => {
		if (dropped) {
			return;
		}
		dropped = true;
		const left = (sites.get(name)?.count ?? 1) - 1;
		if (left <= 0) {
			sites.delete(name);
		} else {
			sites.set(name, { site: sites.get(name)?.site ?? site, count: left });
		}
	};
};

/** The site noted for a listener name, if `devPlugin` is used and the listener is subscribed. */
export const siteOf = (name: string) => sites.get(name)?.site;
