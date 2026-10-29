import type { WithSignal } from "nanoeffects";
import { debounce, latest } from "nanoeffects/policies";
import { api } from "../../api";
import { findProducts, productsLoaded } from "./catalog";

// The work of the catalog domain. It gets `emit` from the task context, so it imports no bus.

// the answer to the findProducts command: one request, aborted when the task is
export const answerFind = (query: string, { signal }: WithSignal) =>
  api.searchProducts(query, { signal });

// debounce — wait 300 ms of quiet; latest — a newer search aborts the older one
export const search = debounce(
  300,
  latest(async (query: string, { emit }) => {
    // emit with a command — runs it and gives back what its handler returned
    const found = await emit(findProducts(query));
    // emit with an action — tell the bus the result; nothing is delivered after an abort
    emit(productsLoaded(found));
  }),
);
