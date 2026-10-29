import { createModule } from "nanoeffects/actions";
import { placeOrder } from "./checkout";
import { submitOrder } from "./checkout-handlers";
import { checkoutStore } from "./checkout-store";

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

export const checkoutModule = createModule("checkout", (module) => {
  // handle — this module does the work of the placeOrder job while it is mounted
  module.handle(placeOrder, submitOrder);

  // the job sends exactly one closing outcome after each pending, so the store never sticks on "running"
  module.on(placeOrder.pending, () => checkoutStore.set({ status: "running" }));
  module.on(placeOrder.success, (order) => checkoutStore.set({ status: "done", order }));
  module.on(placeOrder.fail, (error) => checkoutStore.set({ status: "failed", message: messageOf(error) }));
  // cancel — the task was aborted: the only outcome that clears "running" then
  module.on(placeOrder.cancel, () => checkoutStore.set({ status: "idle" }));
});
