/**
 * Where `fromSignal` keeps the function that makes a context field from the signal of a
 * task. `Symbol.for`, so `contextPlugin` finds it without importing `nanoeffects/signal`.
 * `createBus` does not import this file.
 */
export const signalFieldKey: unique symbol = Symbol.for(
	"nanoeffects.signalField",
);
