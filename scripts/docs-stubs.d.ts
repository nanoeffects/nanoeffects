// biome-ignore-all lint/suspicious/noExplicitAny: names that the docs take from the reader's app
// Names that snippets of docs/*.md use but do not define: they belong to the reader's app.
// Add a name only when a real snippet needs it; `any` keeps the check on the nanoeffects calls.
declare const api: any;
declare const report: any;
declare const fetchUser: any;
declare const fetchPosts: any;
declare const fetchData: any;
declare const loadUser: any;
declare const persistUser: any;
declare const saveName: any;
declare const smtpSend: any;
declare const fakeUser: any;
declare const upload: any;
declare const validate: any;
declare const render: any;
declare const refresh: any;
declare const load: any;
declare const cleanup: any;
declare const updateScrollbar: any;
declare const isFatal: any;
declare const logger: any;
declare const searchRequest: any;
declare const authModule: any;
declare const orderModule: any;
declare const userModule: any;
declare const store: any;
declare const draft: any;
declare const draftA: any;
declare const draftB: any;
type Store = any;
type Draft = any;
// the docs read the Vite flag `import.meta.env.DEV`
interface ImportMeta {
	env: any;
}
// libraries that the docs import but the project does not install: every import is `any`
declare module "react";
declare module "vue";
declare module "pinia";
declare module "nanostores";
declare module "valtio";
declare module "valtio/utils";
// JSX of the docs: any tag, any props
declare namespace JSX {
	// biome-ignore lint/suspicious/noEmptyInterface: the type of an element is not checked
	interface Element {}
	interface IntrinsicElements {
		[tag: string]: any;
	}
}
