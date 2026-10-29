import { createRoot } from "react-dom/client";
import { App } from "./ui/App";
import "./app"; // mounts the domains, once, when the app starts

const root = document.querySelector("#root");
if (!root) {
  throw new Error("index.html must have #root");
}

createRoot(root).render(<App />);
