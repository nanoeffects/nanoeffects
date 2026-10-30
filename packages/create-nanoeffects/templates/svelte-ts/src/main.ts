import { mount } from "svelte";
import App from "./App.svelte";
import "./search-handlers"; // registers the handlers, once, when the app starts

const target = document.querySelector("#app");
if (!target) {
  throw new Error("index.html must have #app");
}

mount(App, { target });
