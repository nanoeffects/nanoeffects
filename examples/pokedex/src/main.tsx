import { createRoot } from "react-dom/client";
import "./app"; // mounts the domains, once, when the app starts
import { App } from "./ui/App";

const root = document.querySelector("#root");

if (root) {
	createRoot(root).render(<App />);
}
