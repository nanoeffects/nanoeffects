import type { ConnectDev } from "./types";

const disconnect = () => {};

/** The production build of `connectDev`: it touches nothing and returns a function that does nothing. */
export const connectDev: ConnectDev = () => disconnect;
