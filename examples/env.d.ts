// the part of `import.meta.hot` (Vite) that the examples use
interface ImportMeta {
	readonly hot?: {
		// Vite types it as `any`: a place to keep what must survive a reload
		// biome-ignore lint/suspicious/noExplicitAny: as in Vite
		data: Record<string, any>;
		// biome-ignore lint/suspicious/noExplicitAny: as in Vite
		accept(dependency: string, callback: (module: any) => void): void;
		dispose(callback: () => void): void;
	};
}
