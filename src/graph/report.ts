import { siteOf } from "../core/site";
import type { DevtoolsExtension, Finding } from "./types";

// one line of advice for each shape of finding; text only, never built from a payload
export const adviceOf = (finding: Finding) => {
	if (finding.kind === "storm") {
		return "an emit from a component or a timer repeats: stop it with `equals` of useEmitter, debounce, or a guard";
	}
	if (finding.kind === "runaway") {
		return "one chain started a huge number of tasks: look for event names that are made from a counter or an id";
	}
	if (finding.path.length <= 2) {
		return "a handler emits its own event: emit a different event for the result";
	}

	return "handlers feed each other: break the loop with a condition, or emit a different event for the result";
};

export const textOf = (finding: Finding, name: string | undefined) => {
	const prefix = name === void 0 ? "[nanoeffects]" : `[nanoeffects ${name}]`;
	const group =
		finding.traceGroupId === void 0 ? "" : ` (flow ${finding.traceGroupId})`;
	const shape =
		finding.kind === "cycle"
			? `cycle: ${finding.path.join(" → ")} (repeated ${finding.repeats} times, started at ${finding.root})`
			: `${finding.kind}: ${finding.path.join(" → ")} (${finding.repeats} in a row, started at ${finding.root})`;

	const sites = [...new Set(finding.path)].flatMap((name) => {
		const site = siteOf(name);

		return site === void 0 ? [] : [`${name} at ${site}`];
	});
	const where = sites.length > 0 ? `\n  ${sites.join("; ")}` : "";

	return `${prefix} ${shape}${group}${where}\n  ${adviceOf(finding)}`;
};

export const connectDevtools = (
	extension: DevtoolsExtension | undefined,
	name: string,
) => {
	if (!extension) {
		return;
	}
	const connection = extension.connect({ name });
	connection.init({ findings: 0 });
	let sent = 0;

	return (finding: Finding) => {
		sent += 1;
		connection.send(
			{
				type: "cycle/detected",
				kind: finding.kind,
				path: finding.path,
				repeats: finding.repeats,
				root: finding.root,
			},
			{ findings: sent },
		);
	};
};
