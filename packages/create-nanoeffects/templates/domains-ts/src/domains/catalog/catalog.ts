import { createAction, createCommand } from "nanoeffects/actions";
import type { Product } from "../../api";

// The contract of the catalog domain with the rest of the app.
// This file imports no bus, so any module and any component can import it.

// createAction<Payload> — an event: something happened, and anyone may listen
export const productsLoaded = createAction<Product[]>("catalog/loaded");

// createCommand — an order for this domain: one module answers it, and the call can return a result.
// searchCatalog starts a search; findProducts asks for the products and returns them.
export const searchCatalog = createCommand<string, unknown>("catalog/search");
export const findProducts = createCommand<string, Promise<Product[]>>("catalog/find");
