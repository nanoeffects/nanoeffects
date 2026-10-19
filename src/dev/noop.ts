import type { DevPlugin } from "./types";

const disconnect = () => {};
const plugin = () => disconnect;

/** The production build of `devPlugin`: a plugin that touches nothing and returns a function that does nothing. */
export const devPlugin: DevPlugin = () => plugin;
