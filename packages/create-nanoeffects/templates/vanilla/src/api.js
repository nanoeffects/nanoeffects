// A fake server: replace it with your own requests. It takes 800 ms and honors the signal.
const titles = ["nano", "nanoeffects", "nanobus", "nanoid", "nanostores"];

export const api = {
  search(query, { signal }) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const found = titles.filter((title) => title.includes(query));
        resolve(found);
      }, 800);

      signal.addEventListener("abort", () => {
        clearTimeout(timer);
        reject(signal.reason);
      });
    });
  },
};
