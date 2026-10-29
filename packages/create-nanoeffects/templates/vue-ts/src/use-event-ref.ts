import type { ActionCreator } from "nanoeffects/actions";
import { onScopeDispose, shallowRef } from "vue";
import { bus } from "./bus";

// A small helper that belongs to this project: change it as you like.
//
// useEventRef(event, initial) is like ref(initial), but every `event` of the bus sets the value to
// its payload. The type of the ref comes from the event: createAction<string[]> gives Ref<string[]>.
//
// WARNING: this is state of one component, not a global store. A second component that calls it
// gets its own copy, and an event that came before the call is lost: the bus keeps no values.
// To share a value, keep it in a store (for example Pinia) and write to it from a handler of the
// event, or call this once in a component at the root and pass the ref down with provide/inject.
export function useEventRef<P>(event: ActionCreator<P, string>, initial: P) {
  const state = shallowRef(initial);

  // bus.on — listen to the event; it returns the function that stops listening
  // onScopeDispose — run that function when the component is unmounted
  onScopeDispose(
    bus.on(event, (payload) => {
      state.value = payload;
    }),
  );

  return state;
}
