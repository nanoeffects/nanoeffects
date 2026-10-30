const limit = 6;

// The names that start with the text come first, then the names that only contain it, each group
// in the order of the list. A blank text gives none.
export const suggestionsFor = (text: string, names: string[]) => {
	const typed = text.trim().toLowerCase();
	if (typed === "") {
		return [];
	}

	const starting: string[] = [];
	const containing: string[] = [];
	for (const name of names) {
		if (name.startsWith(typed)) {
			starting.push(name);
		} else if (name.includes(typed)) {
			containing.push(name);
		}
	}

	return [...starting, ...containing].slice(0, limit);
};
