/** A handle of `setTimer`; hand it to `clearTimer`. */
export type Timer = { id: ReturnType<typeof setTimeout> | null };

// setTimeout fires at once for a wait over this (about 24.8 days)
const LIMIT = 2 ** 31 - 1;

/**
 * Like `setTimeout`, but safe for any wait: one over the limit of the platform
 * is split in parts, `Infinity` never fires (and holds no timer), and a
 * negative or `NaN` wait is zero.
 */
export const setTimer = (fn: () => void, ms: number): Timer => {
	const timer: Timer = { id: null };
	if (ms === Number.POSITIVE_INFINITY) {
		return timer;
	}

	const arm = (left: number) => {
		timer.id = setTimeout(
			() => {
				if (left > LIMIT) {
					arm(left - LIMIT);
				} else {
					timer.id = null;
					fn();
				}
			},
			Math.min(left, LIMIT),
		);
	};
	arm(ms > 0 ? ms : 0);

	return timer;
};

export const clearTimer = (timer: Timer) => {
	if (timer.id !== null) {
		clearTimeout(timer.id);
		timer.id = null;
	}
};
