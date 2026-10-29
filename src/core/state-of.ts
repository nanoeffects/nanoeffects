// `[]` is `never[]` to TypeScript, which nothing can be read from
type Widen<S> = [S] extends [never[]] ? unknown[] : S;

/**
 * The type of the state that keeps the last payload of an event (`useEventState`,
 * `useEventRef`): the payload type when the event has one, and otherwise the type of the
 * initial value, widened, so a creator without a payload type still gives a typed state.
 */
export type StateOf<P, S> = unknown extends P ? Widen<S> : P;
