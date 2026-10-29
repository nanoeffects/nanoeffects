import { leading } from "nanoeffects/policies";
import { retry } from "nanoeffects/effects";
import { api } from "../../api";

// The work of the checkout domain.

// retry — try again after a failure, up to 3 attempts, 300 ms apart
// leading — a second click while the first order runs is dropped, so it is not charged twice
export const submitOrder = leading(
  retry(
    async (productId: string, { signal }: { signal: AbortSignal }) => {
      return api.placeOrder(productId, { signal });
    },
    { times: 3, delay: 300 },
  ),
);
