import type { WithSignal } from "nanoeffects";
import { createAction } from "nanoeffects/actions";
import { api, type Product } from "../../api";

// The contract of the catalog domain with the rest of the app.
// This file imports no bus, so any module and any component can import it.

// createAction<Payload> — an event: something happened, and anyone may listen
export const searchRequested = createAction<string>("catalog/searchRequested");
export const productsLoaded = createAction<Product[]>("catalog/loaded");

// createAction — a call that returns a result, with the handler that does it, so it works whenever
// it is called. The module below binds it with module.use for as long as it is mounted.
export const findProducts = createAction(
  "catalog/find",
  (query: string, { signal }: WithSignal) => api.searchProducts(query, { signal }),
);
