import { modulePlugin } from "nanoeffects/actions";
import { bus } from "./bus";
import { catalogModule } from "./domains/catalog/catalog-module";
import { checkoutModule } from "./domains/checkout/checkout-module";

// modulePlugin — mount every domain on the bus; app.unmount(module) removes one of them
export const app = bus.use(modulePlugin([catalogModule, checkoutModule]));
