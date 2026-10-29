import { useSyncExternalStore } from "react";
import { checkoutStore } from "../domains/checkout/checkout-store";

export function CheckoutStatus() {
  // useSyncExternalStore — read the store of the checkout domain, written from the job's outcomes
  const state = useSyncExternalStore(checkoutStore.subscribe, checkoutStore.get);

  if (state.status === "running") {
    return <p>Placing the order…</p>;
  }
  if (state.status === "done") {
    return <p>Done: {state.order}</p>;
  }
  if (state.status === "failed") {
    return <p>Failed: {state.message}</p>;
  }
  return <p>No order yet.</p>;
}
