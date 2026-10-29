import { bus } from "./bus";
import { queryChanged, searchLoaded } from "./search";
import "./search-handlers"; // registers the handlers, once, when the app starts

const input = document.querySelector<HTMLInputElement>("#query");
const status = document.querySelector("#status");
const results = document.querySelector("#results");
if (!input || !status || !results) {
  throw new Error("index.html must have #query, #status and #results");
}

// bus.emit — tell the bus the query changed; the handler debounces and searches
input.addEventListener("input", () => {
  status.textContent = "Waiting for you to stop typing…";
  bus.emit(queryChanged(input.value));
});

// bus.on — show what the handler found (it returns a function that unsubscribes)
bus.on(searchLoaded, (found) => {
  status.textContent = `${found.length} found`;
  results.replaceChildren(
    ...found.map((title) => {
      const item = document.createElement("li");
      item.textContent = title;
      return item;
    }),
  );
});
