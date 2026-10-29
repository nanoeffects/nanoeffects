import { bus } from "../bus";
import { placeOrder } from "../domains/checkout/checkout";
import { useProducts } from "./ProductsProvider";

export function Products() {
  const products = useProducts();

  return (
    <ul>
      {products.map((product) => (
        <li key={product.id}>
          {product.title}, ${product.price}{" "}
          {/* bus.emit — start the job; the checkout domain decides what happens next */}
          <button onClick={() => bus.emit(placeOrder(product.id))}>Buy</button>
        </li>
      ))}
    </ul>
  );
}
