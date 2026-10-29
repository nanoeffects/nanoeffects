import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./search-handlers"; // registers the handlers, once, when the app starts

createRoot(document.querySelector("#root")).render(<App />);
