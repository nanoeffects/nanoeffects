import { CheckoutStatus } from "./CheckoutStatus";
import { Products } from "./Products";
import { ProductsProvider } from "./ProductsProvider";
import { SearchBox } from "./SearchBox";

export function App() {
  return (
    <ProductsProvider>
      <h1>Logic split by domain</h1>
      <p>
        The components only emit and read. Searching lives in the catalog domain and ordering in the
        checkout domain (see src/domains). The first payment fails on purpose: retry runs it again.
      </p>
      <SearchBox />
      <Products />
      <CheckoutStatus />
    </ProductsProvider>
  );
}
