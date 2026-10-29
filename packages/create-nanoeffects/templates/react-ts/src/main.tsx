import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./search-handlers"; // registers the handlers, once, when the app starts

const root = document.querySelector("#root");
if (!root) {
  throw new Error("index.html must have #root");
}

createRoot(root).render(<App />);
