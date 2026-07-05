// Ambient typings so `import logo from "./x.png"` resolves during the package's
// own `tsc --noEmit`. Consuming Next apps get the same shape from next-env.d.ts.
declare module "*.png" {
  const content: import("next/image").StaticImageData;
  export default content;
}
