import { createJob } from "nanoeffects/actions";

// The events of the checkout domain. This file imports no bus.

// createJob — a command that also sends its outcome as events:
// placeOrder.pending, .success, .fail and .cancel; the module below says who does the work
export const placeOrder = createJob<string, string>("checkout/placeOrder");
