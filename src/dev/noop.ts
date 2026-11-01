import type { DevPlugin, LostSignal } from "./types";

const disconnect = () => {};
const plugin = () => disconnect;

/** The production build of `devPlugin`: a plugin that touches nothing and returns a function that does nothing. */
export const devPlugin: DevPlugin = () => plugin;

/** The production build of `getLostSignals`: nothing is recorded, so the list is empty. */
export const getLostSignals = async (): Promise<LostSignal[]> => [];

/** The production build of `getLostSignalsCount`: nothing is recorded, so the count is 0. */
export const getLostSignalsCount = async () => 0;
