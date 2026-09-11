/**
 * Stand-in for a static image import under vitest.
 *
 * Next's bundler turns `import logo from "./logo.png"` into a StaticImageData
 * object, but vitest resolves it to a plain path string, and `next/image` then
 * rejects it for having no intrinsic `width`. The alias in vitest.config.ts
 * points every image import here so components rendering <Image> with a static
 * import (e.g. @barrelsgd/gms Logo) behave as they do in a real build.
 */
const staticImage = {
  src: "/test-image.png",
  height: 200,
  width: 600,
  blurDataURL: "",
  blurWidth: 0,
  blurHeight: 0,
};

export default staticImage;
