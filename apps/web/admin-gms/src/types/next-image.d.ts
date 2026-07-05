// Ambient module declarations for static image imports (`import logo from "x.png"`).
//
// Next generates these into the gitignored `next-env.d.ts` via a reference to
// `next/image-types/global`, but that file only exists after `next dev`/`next build`.
// CI type-checks a fresh checkout with plain `tsc`, so without this committed
// reference `*.png` imports in consumed `@grenmet/ui` components (e.g. Logo) fail
// with TS2307. Committing the same reference makes type-check reproducible.
/// <reference types="next/image-types/global" />
