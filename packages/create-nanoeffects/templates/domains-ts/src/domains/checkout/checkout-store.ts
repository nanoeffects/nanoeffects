// The state of the checkout domain, outside React. The module writes it from the job's outcomes,
// and a component reads it with useSyncExternalStore.
export type CheckoutState =
  | { status: "idle" }
  | { status: "running" }
  | { status: "done"; order: string }
  | { status: "failed"; message: string };

let state: CheckoutState = { status: "idle" };
const listeners = new Set<() => void>();

export const checkoutStore = {
  get: () => state,
  set(next: CheckoutState) {
    state = next;
    for (const listener of listeners) {
      listener();
    }
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
