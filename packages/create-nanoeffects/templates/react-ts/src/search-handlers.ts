import { debounce, latest } from "nanoeffects/policies";
import { api } from "./api";
import { bus } from "./bus";
import { queryChanged, searchLoaded } from "./search";

// bus.on — run the handler for each queryChanged event
// debounce — wait 300 ms of quiet; latest — abort the previous search when a new one starts
bus.on(
  queryChanged,
  debounce(
    300,
    latest(async (query, ctx) => {
      // ctx.signal is aborted by latest; passing it on cancels the request itself
      const found = await api.search(query, { signal: ctx.signal });
      // ctx.emit — tell the bus the result; nothing is delivered after an abort
      ctx.emit(searchLoaded(found));
    }),
  ),
);
