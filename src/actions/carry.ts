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

/** The fields of `base` with those of `over` on top; the `$effects` of both are merged the same way. */
export const beneath = (base: Scope, over: Scope): Scope => ({
	...base,
	...over,
	$effects: { ...base.$effects, ...over.$effects },
});

/** The scope that `carry` put on `target`, if any. */
export const carriedBy = (target: object): Scope | undefined =>
	Reflect.get(target, scopeKey);
