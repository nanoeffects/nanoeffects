import { useState } from "react";
import { bus } from "../bus";
import { searchRequested } from "../domains/catalog/catalog";

export function SearchBox() {
  const [query, setQuery] = useState("");

  function handleChange(value: string) {
    setQuery(value);
    // bus.emit — the catalog domain debounces and searches; the component knows nothing else
    bus.emit(searchRequested(value));
  }

  return (
    <input
      value={query}
      placeholder="Search products"
      autoComplete="off"
      onChange={(event) => handleChange(event.target.value)}
    />
  );
}
