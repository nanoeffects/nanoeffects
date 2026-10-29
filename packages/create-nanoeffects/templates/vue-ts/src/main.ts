import { createApp } from "vue";
import App from "./App.vue";
import "./search-handlers"; // registers the handlers, once, when the app starts

createApp(App).mount("#app");
