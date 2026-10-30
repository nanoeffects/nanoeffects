import type { ActionCreator } from "nanoeffects/actions";
import { readable } from "svelte/store";
import { bus } from "./bus";

// A small helper that belongs to this project: change it as you like.
//
// eventStore(event, initial) is a Svelte store: `$found` in a component reads it, and Svelte
// subscribes and unsubscribes for you. Its value is `initial` at first and, after that, the payload
// of every `event` of the bus. The type comes from the event: createAction<string[]> gives a store
// of string[].
//
// WARNING: this is not a store of the app. It listens to the bus only while something reads it
// (the first `$found` starts it, the last one stops it), and the bus keeps no values, so an event
// that came while nothing read the store is lost. To keep a value for components that come later,
// keep it in a store of your own and write to it from a handler of the event.
export function eventStore<P>(event: ActionCreator<P, string>, initial: P) {
  // readable — a store that is read-only for the component; the function runs when the first
  // subscriber comes, and the function it returns runs when the last subscriber leaves
  // bus.on — listen to the event; it returns the function that stops listening
  return readable(initial, (set) => bus.on(event, set));
}
