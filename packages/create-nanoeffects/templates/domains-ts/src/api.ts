// A fake server: replace it with your own requests. Each call takes a moment and honors the signal.
export type Product = { id: string; title: string; price: number };

const products: Product[] = [
  { id: "p1", title: "Nano keyboard", price: 49 },
  { id: "p2", title: "Nano mouse", price: 25 },
  { id: "p3", title: "Nano cable", price: 9 },
  { id: "p4", title: "Nano stand", price: 31 },
];

const wait = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(signal.reason);
    });
  });

let orders = 0;

export const api = {
  async searchProducts(query: string, { signal }: { signal: AbortSignal }): Promise<Product[]> {
    await wait(500, signal);
    return products.filter((product) => product.title.toLowerCase().includes(query.toLowerCase()));
  },

  // fails on its first call on purpose, so you can see retry and the failed state
  async placeOrder(productId: string, { signal }: { signal: AbortSignal }): Promise<string> {
    await wait(600, signal);
    orders += 1;
    if (orders % 3 === 1) {
      throw new Error("The payment service is busy");
    }
    return `order-${orders}-${productId}`;
  },
};
