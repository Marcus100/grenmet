// Ambient typings so `import logo from "./x.png"` resolves during the package's
// own `tsc --noEmit`. Consuming Next apps get the same shape from next-env.d.ts.
declare module "*.png" {
  const content: import("next/image").StaticImageData;
  export default content;
}

// Do NOT add a "*.svg" declaration here. gaa-admin runs @svgr/webpack (see its
// next.config), so a .svg imported from this package resolves to a React
// component there and to a URL in gms — the same import means two different
// things in the two apps that render Logo. Vector logo assets need either an
// inline .tsx component or aligned bundler config; see docs/design-system.md.
