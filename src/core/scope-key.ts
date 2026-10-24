/**
 * Where an action, a command or a call keeps its scope. `Symbol.for`, so
 * `scopePlugin` finds it without importing the code that put it there.
 * `createBus` does not import this file.
 */
export const scopeKey = Symbol.for("nanoeffects.scope");
