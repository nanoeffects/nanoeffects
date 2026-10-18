// Types for the two lodash functions the parity tests compare against.
type Edges = { leading: boolean; trailing: boolean };
type Limited = (
	fn: (n: number) => void,
	wait: number,
	options: Edges,
) => (n: number) => void;

declare module "lodash/throttle.js" {
	const throttle: Limited;
	export default throttle;
}

declare module "lodash/debounce.js" {
	const debounce: Limited;
	export default debounce;
}
