/**
 * Where a task context lets its `emit` through after an abort: `createJob` sets
 * it for the time of its own emit of `cancel`. A plain symbol, shared by import.
 * It is not on the public `Context` type.
 */
export const emitAfterAbort = Symbol();

/** A context while `createJob` sends its `cancel`. */
export type EmitGate = { [emitAfterAbort]?: boolean };
