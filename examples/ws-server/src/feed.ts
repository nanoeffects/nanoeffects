// A fake price feed with no network: the price of a symbol at a tick is a fixed walk, so a test
// knows every number.
export type Feed = {
	priceOf: (symbol: string, tick: number) => number;
};

// the symbol sets the level, the tick moves the price around it
const levelOf = (symbol: string) =>
	[...symbol].reduce((sum, letter) => sum + letter.charCodeAt(0), 0);

export const createFeed = (): Feed => ({
	priceOf: (symbol, tick) =>
		Math.round((levelOf(symbol) + Math.sin(tick / 3) * 10) * 100) / 100,
});
