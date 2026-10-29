import { createAction, createCommand } from "nanoeffects/actions";
import type { Product } from "../../api";

// The events of the catalog domain: its contract with the rest of the app.
// This file imports no bus, so any module and any component can import it.

// createAction<Payload> — an event with a name and the type of its payload
export const searchRequested = createAction<string>("catalog/searchRequested");
export const productsLoaded = createAction<Product[]>("catalog/loaded");

// createCommand — a call that returns a result; the module below says who answers it
export const findProducts = createCommand<string, Promise<Product[]>>("catalog/find");
