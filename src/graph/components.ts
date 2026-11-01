export type Edge = { from: string; to: string };

type Frame = { name: string; next: number };

/**
 * The cycles of a graph: its strongly connected components with more than one
 * node, and each node that feeds itself (Tarjan, with a loop in place of the
 * recursion, so a graph of 100 000 nodes does not overflow the stack).
 */
export const findComponents = (edges: readonly Edge[]): string[][] => {
	const successors = new Map<string, string[]>();
	for (const { from, to } of edges) {
		const list = successors.get(from) ?? [];
		list.push(to);
		successors.set(from, list);
		if (!successors.has(to)) {
			successors.set(to, []);
		}
	}

	const index = new Map<string, number>();
	const low = new Map<string, number>();
	const onStack = new Set<string>();
	const stack: string[] = [];
	const found: string[][] = [];
	let counter = 0;

	const visit = (name: string, frames: Frame[]) => {
		index.set(name, counter);
		low.set(name, counter);
		counter += 1;
		stack.push(name);
		onStack.add(name);
		frames.push({ name, next: 0 });
	};

	const close = (root: string) => {
		const component: string[] = [];
		let name: string | undefined;
		do {
			name = stack.pop();
			if (name === void 0) {
				break;
			}
			onStack.delete(name);
			component.push(name);
		} while (name !== root);
		const [only] = component;
		const feedsItself =
			component.length === 1 &&
			only !== void 0 &&
			successors.get(only)?.includes(only);
		if (component.length > 1 || feedsItself) {
			found.push(component.reverse());
		}
	};

	const lower = (name: string, value: number) => {
		low.set(name, Math.min(low.get(name) ?? value, value));
	};

	// takes the next edge of the top frame; false when it has none left
	const advance = (frames: Frame[], top: Frame) => {
		const successor = successors.get(top.name)?.[top.next];
		if (successor === void 0) {
			return false;
		}
		top.next += 1;
		if (!index.has(successor)) {
			visit(successor, frames);
		} else if (onStack.has(successor)) {
			lower(top.name, index.get(successor) ?? 0);
		}

		return true;
	};

	const finish = (frames: Frame[], top: Frame) => {
		frames.pop();
		const parent = frames.at(-1);
		if (parent) {
			lower(parent.name, low.get(top.name) ?? 0);
		}
		if (low.get(top.name) === index.get(top.name)) {
			close(top.name);
		}
	};

	const walk = (start: string) => {
		const frames: Frame[] = [];
		visit(start, frames);
		for (let top = frames.at(-1); top; top = frames.at(-1)) {
			if (!advance(frames, top)) {
				finish(frames, top);
			}
		}
	};

	for (const name of successors.keys()) {
		if (!index.has(name)) {
			walk(name);
		}
	}

	return found;
};
