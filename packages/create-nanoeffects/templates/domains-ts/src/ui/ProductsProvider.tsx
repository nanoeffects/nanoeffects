import { createContext, type ReactNode, useContext } from "react";
import type { Product } from "../api";
import { useEventState } from "../bus";
import { productsLoaded } from "../domains/catalog/catalog";

const ProductsContext = createContext<Product[]>([]);

export function ProductsProvider({ children }: { children: ReactNode }) {
  // useEventState — like useState([]), but productsLoaded sets the value; the type is Product[]
  // WARNING: this is state of this provider, not a global store. An event that came before the provider
  // mounted is lost: the bus keeps no values. Mount it once at the root, and keep a value that
  // must outlive it in a store, as the checkout domain does.
  const [products] = useEventState(productsLoaded, []);

  return <ProductsContext.Provider value={products}>{children}</ProductsContext.Provider>;
}

export const useProducts = () => useContext(ProductsContext);
