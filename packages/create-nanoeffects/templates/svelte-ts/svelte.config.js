import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

export default {
  // vitePreprocess — lets <script lang="ts"> in a .svelte file go through Vite
  preprocess: vitePreprocess(),
};
