/// <reference path="../assets/images.d.ts" />
// The PNG imports below need the ambient "*.png" declaration. A consuming
// app only gets that from next-env.d.ts, which its type-check script deletes,
// so carry the reference here: any app that imports Logo pulls it in too.
import { cn } from "@barrelsgd/ui/lib/utils";
import Image, { type StaticImageData } from "next/image";
import iconColor from "../assets/logo/logo-icon-color.png";
import iconWhite from "../assets/logo/logo-icon-white.png";
import primaryNavy from "../assets/logo/logo-primary-navy.png";
import primaryWhite from "../assets/logo/logo-primary-white.png";
import submarkBlue from "../assets/logo/logo-submark-blue.png";
import submarkNavy from "../assets/logo/logo-submark-navy.png";
import wordmarkNavy from "../assets/logo/logo-wordmark-navy.png";
import wordmarkWhite from "../assets/logo/logo-wordmark-white.png";

export type LogoVariant = "primary" | "submark" | "wordmark" | "icon";

interface LogoAsset {
  readonly dark: StaticImageData;
  readonly light: StaticImageData;
}

// Mini Brand Presentation 2026 artwork. Each variant pairs an asset for light
// surfaces with one for dark surfaces.
//
// `primary` and `wordmark` are one geometry in two inks, so switching on theme
// never shifts layout. `submark` is the badge, which carries its own field: the
// navy badge reads on light surfaces, the blue badge on dark ones (the navy
// badge's outer ring would disappear against --gm-navy). `icon` is the bare
// mark — full colour on light, white on dark, because the mark's navy interior
// vanishes against a dark surface.
//
// Three further lockups ship in ../assets/logo for design use and are
// deliberately not exposed here: logo-primary-color (the kit's full-colour
// white-background lockup), logo-stacked-white (the kit's stacked hero lockup)
// and logo-icon-navy.
const LOGO_ASSETS: Record<LogoVariant, LogoAsset> = {
  primary: { light: primaryNavy, dark: primaryWhite },
  submark: { light: submarkNavy, dark: submarkBlue },
  wordmark: { light: wordmarkNavy, dark: wordmarkWhite },
  icon: { light: iconColor, dark: iconWhite },
};

interface LogoProps {
  readonly alt?: string;
  /**
   * Size/layout classes. The caller must constrain the size — e.g.
   * `className="h-7 w-auto"` for a lockup, `className="size-7"` for the icon.
   */
  readonly className?: string;
  readonly priority?: boolean;
  readonly sizes?: string;
  /** Which lockup to render. Defaults to the horizontal `primary` lockup. */
  readonly variant?: LogoVariant;
}

/**
 * Grenada Meteorological Service brand mark. Theme-aware: on dark surfaces the
 * white asset is shown via the `dark` class variant, with no client JS and no
 * hydration flash (both images render server-side; CSS hides the wrong one).
 */
export function Logo({
  variant = "primary",
  className,
  alt = "Grenada Meteorological Service",
  priority,
  sizes,
}: LogoProps) {
  const { light, dark } = LOGO_ASSETS[variant];

  if (light === dark) {
    return (
      <Image
        alt={alt}
        className={className}
        priority={priority}
        sizes={sizes}
        src={light}
      />
    );
  }

  return (
    <>
      <Image
        alt={alt}
        className={cn("dark:hidden", className)}
        priority={priority}
        sizes={sizes}
        src={light}
      />
      <Image
        alt={alt}
        className={cn("hidden dark:block", className)}
        priority={priority}
        sizes={sizes}
        src={dark}
      />
    </>
  );
}
