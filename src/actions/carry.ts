import { scopeKey } from "../core/scope-key";
import type { Scope } from "../core/scope-types";

/** Puts `scope` on `target` where `scopePlugin` looks for it (not enumerable). Does nothing without a scope. */
export const carry = <T extends object>(
	target: T,
	scope: Scope | undefined,
): T => {
	if (scope) {
		Object.defineProperty(target, scopeKey, { value: scope });
	}

	return target;
};
