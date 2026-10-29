// lets TypeScript import a .vue file; vue-tsc reads the real types from the file itself
declare module "*.vue" {
  import type { DefineComponent } from "vue";

  const component: DefineComponent<object, object, unknown>;
  export default component;
}
