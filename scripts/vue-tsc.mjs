// Runs `vue-tsc` with TypeScript 5. vue-tsc needs the JavaScript API of TypeScript, which the
// native TypeScript 7 of this repository does not have, so it is given the `typescript-5` copy.
// `node scripts/vue-tsc.mjs -p tsconfig.json --noEmit`: the arguments are those of `tsc`.
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

require("vue-tsc").run(require.resolve("typescript-5/lib/tsc"));
